---
title: conn3x generate step
description: Print a step for something a host already has, ready to adopt with import = true.
---

:::note
`generate step` is in Conn3x since v0.9.0. Earlier releases don't have it.
:::

`conn3x generate step` reads one object on a host and prints a step for it, with `import = true` at the top. Paste the step into a circuit and plan: the plan imports it with nothing to change. It doesn't need a circuit or a working directory, and it changes nothing on the host.

This command is Conn3x only. For adopting a whole server, see [Adopt servers you already run](/guides/adopt-servers).

## Usage

```sh
conn3x generate step -host <HOST> [options] <MODULE> [NAME=VALUE ...]
```

`MODULE` is the step's module, such as `file` or `service`. The `NAME=VALUE` pairs are the arguments that identify the object: a file's `path`, a package's or service's `name`, and so on.

```text
$ conn3x generate step -host 203.0.113.10 -user root file path=/etc/motd
step "etc_motd" {
  import = true
  file {
    path    = "/etc/motd"
    group   = "wheel"
    mode    = "0640"
    owner   = "root"
    content = <<EOT
Welcome $${user}
EOT
  }
}
```

## Options

| Option | What it does |
| --- | --- |
| `-host` | Host name or address to read from. Required. |
| `-user` | User to log in as. |
| `-port` | SSH port. Defaults to 22. |
| `-private-key-file` | Private key to log in with. Defaults to the SSH agent. |
| `-known-hosts-file` | known_hosts file to check the host against. Defaults to `~/.ssh/known_hosts`. |
| `-become` | Read as root through sudo, as `become` in a circuit's `ssh` block. Most of what you'd adopt, such as `/etc/nginx`, units and users, needs it unless you log in as root. |
| `-name` | The step's name. Defaults to one made from the object: `etc_motd` for `path=/etc/motd`, `nginx` for `name=nginx`, or the module's name for `hostname`, `timezone` and `locale`. |
| `-write-only` | For a file: print `content_wo` with a placeholder, and keep the content out of the output. |

The host is checked against known_hosts the same way [plan](/reference/cli/plan#plan-reads-your-hosts) checks it. There's no option to skip the check.

## Values

A string argument takes its text as written, so `version=1.10` and `mode=0640` stay as they are. Put it in double quotes if your shell would otherwise split it. Number, bool and list arguments are read as HCL, such as `uid=1000`, `enabled=true` or `groups=["ops"]`.

An argument the module doesn't have, a computed one, or one that's never read from the host (`content`, `content_wo`, `validate`, `on_remove`) is an error, reported before anything connects.

## How it reads the host

`generate step` reads the object the same way a step's [`import`](/reference/circuits/steps#import) does, with the same import ID and the same read, so what it prints is what `import = true` would adopt. Arguments a module only reads back when they're set, such as a file's `owner` and `group` or a service's `state` and `enabled`, come out as the host has them.

It covers the modules a step can import. For those whose reads only say whether the host matches, such as `cron`, `sysctl` and the firewall rules, there's nothing more to read: the step holds the arguments you give, once the host is shown to have the object.

## File content

A file's content is printed as a heredoc, with `${` and `%{` escaped as `$${` and `%%{` so it stays literal. Content without a final newline, or with a line that would end the heredoc, is printed as a quoted string instead.

Since v0.12.0, so is content with a control character: anything that isn't printable, a newline or a tab comes out as a `\u` escape inside a quoted string. A terminal hides escape sequences and leaves them out of what you copy, so this keeps the step you paste the same as the step you saw.

The step gets `content_wo = "REPLACE ME"`, and a comment saying why, when:

- the content isn't UTF-8 text,
- it's over 64 KiB, or
- you passed `-write-only`. The file is still read to your machine, as every file step's read does, but its content is never printed or stored.

Replace the placeholder with the real content, or a reference to it, before you plan.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | It printed a step. |
| 1 | An error, including a host that doesn't have the object: `203.0.113.10 doesn't have file /etc/not-here`. |

## Many steps at once: generate steps

New in v0.18.0. Adopting a long-lived server means a step for every package, service and user you care about. `generate steps` lists what a host has, and with `-match` prints a step for each object that matches, read exactly as `generate step` reads one:

```sh
conn3x generate steps -host 203.0.113.10 -user root packages
conn3x generate steps -host 203.0.113.10 -user root -match 'nginx*,postgresql-16' packages >> adopt.circuit.hcl
conn3x generate steps -host 203.0.113.10 -user root -match 'alice,bob' users >> adopt.circuit.hcl
```

| Kind | What it lists | Step |
| --- | --- | --- |
| `packages` | Every installed package. | `package` |
| `services` | Every systemd service unit. | `service` |
| `users` | Accounts with a UID from 1000: the ones people made, not the system's. | `user` |
| `mounts` | The mount points `/etc/fstab` lists, swap left out. | `mount` |
| `sysctl` | The kernel parameters set in `/etc/sysctl.conf` and `/etc/sysctl.d`, with their values, the later file winning. Since the release after v0.18.0. | `sysctl` |

A `sysctl` step keeps its setting in a file of its own, `/etc/sysctl.d/90-conn3x-NAME.conf`, so adopting one plans a change: the first apply writes that file. The file the setting came from stays, and the kernel reads these files in name order, so a later one, such as `90-local.conf`, wins at boot. Take the setting out of it once the step is in.

Without `-match` it prints one name per line, so you can pick from the list or pipe it through `grep`. `-match` takes globs separated by commas. Every step has `import = true` and a name of its own, so pasting them into a circuit and planning shows them as imports with nothing to change. An object that can't be read is reported on stderr, and the rest still print. It exits `1` when anything failed, or when `-match` matched nothing.
