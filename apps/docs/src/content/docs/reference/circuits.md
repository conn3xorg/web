---
title: Circuit language
description: Every block and argument a circuit takes.
---

## circuit

```hcl
circuit "NAME" {
  hosts = { NAME = "ADDRESS", ... }
  ssh { ... }

  step "NAME" { ... }
  handler "NAME" { ... }
}
```

| Argument | Description |
| --- | --- |
| `hosts` | Required. A map of host name to address. Any expression that produces a map works, including one built from resources in the same plan. |
| `ssh` | Required block. How to reach every host in the circuit. |

The circuit name, like step and handler names, must be a valid identifier without a double underscore.

## ssh

| Argument | Description |
| --- | --- |
| `user` | User to log in as. Required unless `ssh_config_file` sets one. |
| `port` | SSH port. Defaults to 22. |
| `private_key_file` | Path to a private key. Defaults to the SSH agent. |
| `known_hosts_file` | known_hosts file to check host keys against. Defaults to `~/.ssh/known_hosts`. |
| `host_key` | A pinned host public key, in authorized_keys format, instead of known_hosts. Useful for a server created in the same plan. |
| `become` | Run commands as root through sudo. |
| `become_password_file` | File holding the sudo password, when sudo needs one. |
| `timeout` | How long to keep trying while a host isn't answering yet, such as a server still booting. Defaults to `"3m"`. |
| `jump_hosts` | Hosts to connect through first, in order, like `ssh -J`: `["deploy@bastion.example.com", "10.0.0.5:2222"]`. Each is checked against known_hosts and uses the same key. |
| `ssh_config_file` | An OpenSSH config, such as `"~/.ssh/config"`, to look each host up in as a `Host` alias. See [Reach hosts behind a bastion](/guides/bastions). |

The host's address comes from `hosts`; `ssh` has no `host` argument.

## step

```hcl
step "NAME" {
  MODULE { ... }
  depends_on = [ ... ]
  notify     = [handler.NAME, ...]
}
```

A step holds exactly one module block; the [modules reference](/modules/file) lists them all. Steps run in the order written: each waits until the step before it has finished on every host.

| Argument | Description |
| --- | --- |
| `depends_on` | Other resources or steps this step waits for, beyond the one before it. |
| `notify` | Handlers to run when this step changes something. |

Inside a step, `each.key` is the host's name and `each.value` its address.

A step `NAME` in circuit `CIRCUIT` becomes the resource `conn3x_MODULE.CIRCUIT__NAME`, with one instance per host. Use that address to read a step's computed attributes, or in another step's `depends_on`.

## handler

```hcl
handler "NAME" {
  service {
    name   = "SERVICE"
    action = "reload"  # or "restart"
  }
}
```

A handler runs after the steps that notify it, and only on the hosts where one of them changed something. A handler that nothing notifies is a warning.

## Warnings

Conn3x warns when one step writes a whole file and another step edits part of the same file, because each apply would undo the other. Put the edit in the file's content instead.
