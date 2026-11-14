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

With `-m`, it's any module a step can use, such as `service`, `package`, `file` or `windows_service`. `-a` holds its arguments as `NAME=VALUE`, split as a shell would split them, so quote a value with spaces. Values are read as in [`conn3x generate step`](/reference/cli/generate-step): as written for a string argument, and as HCL otherwise, such as `uid=1000` or `groups=["ops"]`.

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
- `step "NAME"` holds exactly one module block, the same blocks a circuit's steps use, with the same `ok` and `changed` as `-m`. Step names are unique.

A step's arguments are expressions that can read `param.NAME`, `host.name` (the inventory name), and `host.vars`, the inventory's variables for the host. Vault-encrypted values are left out of `host.vars`. The functions `upper`, `lower`, `join` and `format` are there too.

`-check` runs every step in check mode. With `-json`, each host's object has `host`, `status`, and `steps`, a list with each step's `step`, `status`, `error`, `stdout` and `stderr`.

## Options

| Option | Description |
| --- | --- |
| `-i`, `-inventory` | The inventory file. Required. |
| `-m` | The module to run. Without it, `-a` is a command. |
| `-task` | A task file to run, instead of `-m`. |
| `-a` | The command, the module's arguments, or the task's params. |
| `-become` | Run as root through `sudo`, as `become` in a circuit's ssh block. |
| `-check` | Say what would change, and change nothing. A command reports `would change`. |
| `-user` | The user to log in as, where the inventory doesn't set `ansible_user`. |
| `-port` | The SSH port, where the inventory doesn't set `ansible_port`. |
| `-private-key-file` | The key to log in with, where the inventory doesn't set one. Defaults to the SSH agent. |
| `-known-hosts-file` | The known_hosts file to check hosts against. Defaults to `~/.ssh/known_hosts`. |
| `-forks` | How many hosts to run on at once. Defaults to 10. |
| `-json` | Print one JSON object per host, with `host`, `status`, `error`, `stdout` and `stderr`, for scripts. |

Each host is checked against known_hosts, as a plan checks it: an unknown host key fails that host. Nothing is written to state or to the working directory.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | It ran on every host it matched, and none failed. |
| 1 | An error before any host ran, such as a bad pattern, an unknown module, or a pattern that matches nothing. |
| 2 | At least one host failed. |

## Not yet

Taking hosts from the circuits in a configuration, instead of from an inventory, is next. Arista EOS modules don't run here, since they commit through a config session per apply. There's no file transfer yet, such as Ansible's `-m copy src=`. In a task, a step's module takes arguments only, not nested blocks, and network-device modules aren't there yet. Chaining tasks into a plan comes later.
