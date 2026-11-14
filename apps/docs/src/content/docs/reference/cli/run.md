---
title: conn3x run
description: Run one command or one module on the hosts in an inventory that a pattern matches, without a circuit and without state.
---

`conn3x run` is for the jobs that don't belong in a circuit: check a service on every web server, restart nginx after a certificate renews, see which hosts still have an old package. It's Ansible's ad-hoc mode, `ansible webservers -m service -a "name=nginx state=restarted"`, reading the same inventory. New in v0.16.0.

This command is Conn3x only.

## Usage

```sh
conn3x run -i <INVENTORY> [options] <PATTERN> -a <COMMAND>
conn3x run -i <INVENTORY> [options] <PATTERN> -m <MODULE> -a <NAME=VALUE ...>
conn3x run -i <INVENTORY> [options] <PATTERN> -task <FILE> [-a <NAME=VALUE ...>]
conn3x run -i <INVENTORY> [options] <PATTERN> -plan <FILE> [-a <NAME=VALUE ...>]
```

## Examples

Check nginx on every web server except `web3`:

```sh
conn3x run -i hosts.ini 'web*:!web3' -a 'systemctl is-active nginx'
```

```text
web1 | changed
  active
web2 | changed
  active
```

Restart it on the web servers in Europe, as root:

```sh
conn3x run -i hosts.ini 'webservers:&eu' -a 'systemctl restart nginx' -become
```

Make sure it's running and starts at boot, which changes only the hosts where it isn't:

```sh
conn3x run -i hosts.ini webservers -m service -a 'name=nginx state=started enabled=true' -become
```

See which hosts are missing a package, without installing it:

```sh
conn3x run -i hosts.ini all -m package -a 'name=htop' -check
```

```text
db1 | ok
web1 | would change
web2 | ok
```

## Hosts

`-i` names an Ansible inventory, INI or YAML. Conn3x reads it as [`provider::conn3x::inventory`](/reference/circuits/hosts#from-an-ansible-inventory) does: each host's address from `ansible_host`, and `ansible_port`, `ansible_user` and `ansible_ssh_private_key_file` where they're set, with the `group_vars/` and `host_vars/` directories beside it.

The pattern is the one [`-limit`](/reference/cli/plan#-limit) takes: names and globs split by `,` or `:`, `!` in front to leave hosts out, `&` to narrow, and `~` for a regular expression. Here it also matches group names, as Ansible's does, so `webservers:&eu` is the hosts in both groups, and `all` is every host.

Since v0.17.0 a group takes a subscript too, to pick hosts by their place in it, counted as current Ansible counts them: from 0, the end left out, negative from the end, in the order the inventory lists them.

| Pattern | Picks |
| --- | --- |
| `webservers[0]` | the first host in `webservers` |
| `webservers[-1]` | the last |
| `webservers[0:2]` | the first two |
| `webservers[1:]` | every host but the first |
| `all[:3]` | the first three hosts in the inventory |

A group's own hosts come before its children's. A name in brackets that isn't a group stays a glob, so `web[0]` is a host called `web0`.

## Commands and modules

Without `-m`, `-a` is a command, run through the host's shell, and its output is printed under the host's line. A command always runs, so it always reports `changed`, or `failed` when it exits nonzero.

With `-m`, it's any module a step can use, such as `service`, `package`, `file` or `windows_service`. `-a` holds its arguments as `NAME=VALUE`, split as a shell would split them, so quote a value with spaces. Values are read as in [`conn3x generate step`](/reference/cli/generate-step): as written for a string argument, and as HCL otherwise, such as `uid=1000` or `groups=["ops"]`. `-m file` also takes `src=PATH`, a text file on this machine to send as the content, as Ansible's `-m copy` does.

A module does exactly what it does in a step. Conn3x reads the host as a refresh would and plans again from what it found. If that plan changes nothing, the host is `ok` and nothing runs. Otherwise the module applies and the host is `changed`. A module's own checks and refusals still apply. A `command` with `creates`, `removes` or `unless` is skipped the same way.

## Tasks

When the same few steps keep coming up together, put them in a task file and run them with `-task`. Each host runs the steps in order. A host that fails a step stops there, and the other hosts carry on.

```hcl title="deploy.task.hcl"
task "deploy" {
  param "version" {}
  param "port" {
    default = 8080
  }

  step "pkg" {
    package {
      name = "myapp-${param.version}"
    }
  }

  step "config" {
    file {
      path    = "/etc/myapp.conf"
      content = "port = ${param.port}\nzone = ${host.vars.zone}\n"
    }
  }

  step "start" {
    service {
      name  = "myapp"
      state = "started"
    }
  }
}
```

```sh
conn3x run -i hosts.ini webservers -task deploy.task.hcl -a 'version=1.4.2' -become
```

```text
web1 | changed
  pkg: changed
  config: changed
  start: ok
web2 | ok
  pkg: ok
  config: ok
  start: ok
```

A host is `changed` when any of its steps changed, and `failed` when one failed. Its lines stop at the failed step, with the module's error.

A file holds one `task` block. Inside it:

- `param "NAME"` declares a param. One without a `default` is required. `-a` gives them as `NAME=VALUE`, and naming a param the task doesn't declare is an error.
- `step "NAME"` holds exactly one module block, the same blocks a circuit's steps use, with the same `ok` and `changed` as `-m`. Step names are unique. Since v0.19.0, a module's nested blocks work too, such as a `crontab` step's `job` blocks. The `ssh` block is the one exception: it comes from the inventory and the flags.

A step's arguments are expressions that can read `param.NAME`, `host.name` (the inventory name), and `host.vars`, the inventory's variables for the host. Vault-encrypted values are left out of `host.vars`. The functions `upper`, `lower`, `join` and `format` are there too.

`-check` runs every step in check mode. With `-json`, each host's object has `host`, `status`, and `steps`, a list with each step's `step`, `status`, `error`, `stdout` and `stderr`.

## Plans

A release is rarely one task on one set of hosts. Migrate the database on one host, then deploy to the web servers: that's a plan. `-plan` runs a plan file's runs in order, each a task on its own hosts, the job a Bolt plan does.

```hcl title="release.plan.hcl"
plan "release" {
  param "version" {}

  run "migrate" {
    task   = "tasks/migrate.task.hcl"
    hosts  = "db[0]"
    params = { version = param.version }
  }

  run "deploy" {
    task   = "tasks/deploy.task.hcl"
    hosts  = "web"
    params = { version = param.version }
  }
}
```

```sh
conn3x run -i hosts.ini all -plan release.plan.hcl -a 'version=1.4.2' -become
```

```text
== migrate: task migrate, 1 host(s)
db1 | changed
  schema: changed
== deploy: task deploy, 2 host(s)
web1 | changed
  pkg: changed
web2 | changed
  pkg: changed
```

Each `run` takes three arguments:

- `task`, the task file, relative to the plan file.
- `hosts`, a host pattern as `run` takes one. It can use `param.*`.
- `params`, an object of the task's params. It can be left out when the task's params all have defaults.

Before anything runs, Conn3x works out every run's hosts and params, so a typo in the last run stops the plan before the first one touches a host. If any host fails in a run, the plan stops there, the runs after it say `skipped`, and the exit code is 2. The command's own PATTERN narrows every run: `web` runs just the runs' web hosts, and `all` leaves each run's pattern as written. With `-json`, every host's object carries its `run`, and a skipped run prints `{"run": "deploy", "status": "skipped"}`.

A run's params can read what the runs before it did, as `run.NAME.HOST.STEP.stdout`, with `stderr` and `status` beside it, so a deploy can take the schema version a migration printed. `trimspace` takes a command's newline off. Params that read `run` are checked for their names before anything runs and evaluated just before their run. `hosts` has to be known from the start, so it can't read `run`. Since v0.19.0.

```hcl
run "deploy" {
  task   = "tasks/deploy.task.hcl"
  hosts  = "web"
  params = { schema = trimspace(run.migrate.db1.schema.stdout) }
}
```

## Options

| Option | Description |
| --- | --- |
| `-i`, `-inventory` | The inventory file. Required. |
| `-m` | The module to run. Without it, `-a` is a command. |
| `-task` | A task file to run, instead of `-m`. |
| `-plan` | A plan file to run, instead of `-m` or `-task`. |
| `-a` | The command, the module's arguments, or the task's or plan's params. |
| `-become` | Run as root through `sudo`, as `become` in a circuit's ssh block. |
| `-check` | Say what would change, and change nothing. A command reports `would change`. |
| `-user` | The user to log in as, where the inventory doesn't set `ansible_user`. |
| `-port` | The SSH port, where the inventory doesn't set `ansible_port`. |
| `-private-key-file` | The key to log in with, where the inventory doesn't set one. Defaults to the SSH agent. |
| `-known-hosts-file` | The known_hosts file to check hosts against. Defaults to `~/.ssh/known_hosts`. |
| `-forks` | How many hosts to run on at once. Defaults to 10. |
| `-batch-size` | Run on this many hosts at a time, or a percentage such as `20%`, rounded up, starting the next batch once a batch is done. Since v0.19.0. |
| `-max-failures` | With `-batch-size`, how many hosts may fail before no more batches start. Defaults to 0. The hosts never reached say `skipped`, and the exit code is 2. |
| `-json` | Print one JSON object per host, with `host`, `status`, `error`, `stdout` and `stderr`, for scripts. |

Each host is checked against known_hosts, as a plan checks it: an unknown host key fails that host. Nothing is written to state or to the working directory.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | It ran on every host it matched, and none failed. |
| 1 | An error before any host ran, such as a bad pattern, an unknown module, or a pattern that matches nothing. |
| 2 | At least one host failed. |

## Not yet

Taking hosts from the circuits in a configuration, instead of from an inventory, is next. Arista EOS modules don't run here, since they commit through a config session per apply. In a task, network-device modules aren't there yet.
