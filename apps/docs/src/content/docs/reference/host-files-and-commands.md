---
title: Files and command output from a host
description: Read a file on a host, or what a command prints there, at plan time, with the conn3x_file and conn3x_command data sources.
---

Sometimes a later step needs a value that only exists on a host: a token another step generated, a cluster's join command, a version file. Ansible carries those across with `slurp` and `register`. In Conn3x, `conn3x_file` and `conn3x_command` read them when you plan, the way [`conn3x_host`](/reference/host-facts) reads facts. New in v0.18.0.

```hcl
data "conn3x_command" "join" {
  command = "kubeadm token create --print-join-command"

  ssh {
    host = "10.0.1.10"
    user = "ops"
    become = true
  }
}

data "conn3x_file" "version" {
  path = "/opt/app/VERSION"

  ssh {
    host = "10.0.1.10"
    user = "ops"
  }
}
```

`data.conn3x_command.join.stdout` then goes into a `command` step on the other nodes, and `data.conn3x_file.version.content` into a precondition.

## conn3x_file

| Attribute | What it is |
| --- | --- |
| `path` | The file, absolute. |
| `max_size` | The largest file to read, in bytes: 1 MiB unless you set it. A bigger file is an error, since the content lands in state. |
| `exists` | Whether it's there. Everything below is null when it isn't. |
| `content` | The content, marked sensitive. |
| `size`, `sha256` | Its size in bytes and the SHA-256 of its content. |
| `mode`, `owner`, `group` | As a `file` step reads them, such as `0644`, `root`, `root`. |

It reads under the same checks a `file` step uses for [paths as root](/guides/paths-as-root).

## conn3x_command

| Attribute | What it is |
| --- | --- |
| `command` | The command, run with `/bin/sh` in the C locale, through `become` when the `ssh` block says so. |
| `stdout`, `stderr` | What it printed, both marked sensitive. |
| `exit_code` | Its exit status. A non-zero one isn't an error, so check it in a postcondition or a `check` block. |

:::caution
`conn3x_command` runs at **every** plan and every refresh, so give it commands that only read. Something like `kubeadm token create` makes a new token each time, which is fine for a token that expires, and wrong for anything that adds up.
:::

## Checks that only report

With an OpenTofu `check` block, the two read data sources give you InSpec-style checks: they report what's wrong, and nothing on the host changes.

```hcl
data "conn3x_command" "root_login" {
  command = "sshd -T | grep -i '^permitrootlogin'"
  ssh {
    host = "10.0.1.10"
    user = "ops"
    become = true
  }
}

check "no_root_ssh" {
  assert {
    condition     = trimspace(nonsensitive(data.conn3x_command.root_login.stdout)) == "permitrootlogin no"
    error_message = "sshd on 10.0.1.10 still lets root log in."
  }
}
```

A failed check is a warning on `plan` and `apply`, not an error, so it fits an audit run in CI. Values stay sensitive until you say otherwise. `nonsensitive` above is safe because the line holds no secret, but don't wrap a token in it.
