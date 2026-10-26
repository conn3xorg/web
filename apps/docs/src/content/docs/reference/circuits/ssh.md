---
title: The ssh block
description: Every argument of a circuit's ssh block and its default, how host objects and SSH config files override it, jump hosts, host key checking, and sudo.
---

Every circuit has exactly one `ssh` block. It says how Conn3x logs in to the circuit's hosts. Each host's address comes from [`hosts`](/reference/circuits/hosts), so the block has no `host` argument; setting one is an error.

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
    web2 = "203.0.113.11"
  }

  ssh {
    user             = "deploy"
    private_key_file = "~/.ssh/id_ed25519"
    become           = true
    timeout          = "5m"
  }
}
```

Conn3x uses SSH and nothing else. It installs nothing on the hosts. Each host needs an SSH server, `/bin/sh`, and `sudo` if you set `become`.

## Arguments

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `user` | string | None | The user to log in as. Required, unless `ssh_config_file` sets `User` for the host. |
| `port` | number | `22` | The SSH port, from 1 to 65535. |
| `private_key_file` | string | The SSH agent | Path to a private key file. When unset, Conn3x uses the keys in the agent at `SSH_AUTH_SOCK`. |
| `known_hosts_file` | string | `~/.ssh/known_hosts` | The known_hosts file to check host keys against. |
| `host_key` | string | None | A pinned host public key, in authorized_keys format, such as `"ssh-ed25519 AAAA..."`. When set, Conn3x checks the host against this key instead of `known_hosts_file`. |
| `become` | bool | `false` | Run every command as root through `sudo`. |
| `become_password_file` | string | None | Path to a file holding the sudo password, for hosts where sudo asks for one. Read only when `become` is `true`. |
| `timeout` | string | `"3m"` | How long to keep retrying while a host doesn't answer, as a duration such as `"90s"` or `"5m"`. |
| `jump_hosts` | list of strings | None | Hosts to connect through first, in order, like `ssh -J`. See [Jump hosts](#jump-hosts). |
| `ssh_config_file` | string | None | An OpenSSH client config file to read settings from, such as `"~/.ssh/config"`. Conn3x reads no SSH config unless you set this. See [SSH config files](#ssh-config-files). |

Paths that start with `~/` are relative to your home directory. Other relative paths are relative to the working directory, which `-chdir` sets.

There is no argument for an inline private key or password, because resource arguments are stored in state. Point `private_key_file` at a key, or use the agent. A key file protected by a passphrase can't be read; load it into the agent instead and leave `private_key_file` unset.

Every argument takes an expression, such as a variable. `conn3x validate` rejects a `timeout` that isn't a valid duration. A missing `user`, a port outside 1 to 65535, and a key file that can't be read are reported when Conn3x first connects, during `plan` or `apply`.

### each in the ssh block

In the `ssh` block, `each.key` and `each.value` always mean the host. That holds in a step with its own `for_each` too: the instance is keyed `"HOST/ITEM"`, but `each.key` in the `ssh` block is still the host's name. So a per-host setting written once in the block reaches the right host in every step:

```hcl
circuit "app" {
  hosts = {
    app1 = "10.0.1.5"
    app2 = "10.0.1.6"
  }

  ssh {
    user             = "deploy"
    private_key_file = "~/.ssh/${each.key}"
  }

  step "tools" {
    for_each = ["git", "jq"]
    package {
      name = item.value
    }
  }
}
```

Both of `app1`'s instances log in with `~/.ssh/app1`. For the five settings a [host object](/reference/circuits/hosts#host-object-fields) can override, a host object is usually easier to read.

## Precedence

Conn3x builds each host's connection settings from up to three places. The first one that sets a value wins:

1. The host's [host object](/reference/circuits/hosts#host-object-fields) in `hosts`, for `user`, `port`, `private_key_file`, `host_key` and `jump_hosts`.
2. The circuit's `ssh` block.
3. The file named in `ssh_config_file`, for `User`, `Port`, `IdentityFile`, `UserKnownHostsFile` and `ProxyJump`.

When none of them sets a value, the default in the table above applies.

`become`, `become_password_file`, `known_hosts_file`, `timeout` and `ssh_config_file` can't be set per host. They come from the `ssh` block for every host in the circuit, with `known_hosts_file` falling back to the config file's `UserKnownHostsFile`.

## SSH config files

With `ssh_config_file` set, Conn3x looks each host up in that file, using the host's address from `hosts` as the `Host` alias. It reads these keywords:

| Keyword | Used as |
| --- | --- |
| `HostName` | The address to connect to. |
| `User` | `user`, when no host object or `ssh` block sets it. |
| `Port` | `port`, when no host object or `ssh` block sets it. |
| `IdentityFile` | `private_key_file`, when no host object or `ssh` block sets it. |
| `UserKnownHostsFile` | `known_hosts_file`, when the `ssh` block doesn't set it. Only the first file listed is used. |
| `ProxyJump` | `jump_hosts`, when no host object or `ssh` block sets it. Each hop is looked up in the same file; see [ProxyJump](#proxyjump). `ProxyJump none` is ignored. |

Conn3x ignores every other keyword in the file.

```hcl
circuit "app" {
  hosts = {
    app1 = "app1"
    app2 = "app2"
  }

  ssh {
    ssh_config_file = "~/.ssh/config"
    become          = true
  }
}
```

Conn3x doesn't read `~/.ssh/config` by default, so a `Host *` entry in someone's personal config can't change where a plan connects. For a walkthrough, see [Reach hosts behind a bastion](/guides/bastions).

### ProxyJump

A `ProxyJump` hop can name another `Host` entry in the same file, the way you'd write it for `ssh`:

```sshconfig
Host bastion
  HostName bastion.example.com
  User admin
  IdentityFile ~/.ssh/bastion_ed25519

Host app*
  User deploy
  ProxyJump bastion
```

Conn3x looks each hop up as OpenSSH does. It takes the hop's `HostName`, `User`, `Port` and `IdentityFile` from its entry, and if that entry has a `ProxyJump` of its own, those hops come first. A user or port written in the hop itself, as in `ProxyJump ops@bastion:2222`, wins over the entry. A hop whose entry sets `IdentityFile` logs in with that key; the others use the target's. A `ProxyJump` loop is an error.

`jump_hosts` in the `ssh` block or a host object still wins over `ProxyJump`, and its entries are used as written, without looking them up in the file.

## Jump hosts

`jump_hosts` lists hosts to connect through before reaching the target, in order. Each entry has the form `[user@]host[:port]`, the same as `ssh -J`. Write IPv6 addresses in brackets, such as `"[2001:db8::1]:2222"`.

```hcl
circuit "app" {
  hosts = {
    app1 = "10.0.1.5"
    app2 = "10.0.1.6"
  }

  ssh {
    user       = "deploy"
    jump_hosts = ["deploy@bastion.example.com", "10.0.0.5:2222"]
  }
}
```

- An entry without a user logs in as the target's `user`.
- An entry without a port uses port 22.
- Every hop authenticates with the same key as the target: `private_key_file`, or the SSH agent. The one exception is a `ProxyJump` hop whose entry in `ssh_config_file` sets its own `IdentityFile`; see [ProxyJump](#proxyjump).
- Every hop's host key is checked against `known_hosts_file`. A pinned `host_key` applies only to the target, not to the hops.

A host object's `jump_hosts` replaces the `ssh` block's list for that host. Set it to `[]` to connect to that host directly, without the circuit's jump hosts or a `ProxyJump` from the SSH config file.

## Host keys

Conn3x always verifies the host key, for the target and for every jump host. There is no setting to turn this off.

Without `host_key`, Conn3x checks the host against `known_hosts_file`, or `~/.ssh/known_hosts` by default. For a port other than 22, the entry has to be in OpenSSH's `[host]:port` form. If the host isn't in the file, or its key has changed since it was recorded, Conn3x stops with an error and doesn't connect. Add a new host's key after checking it, for example with `ssh-keyscan`.

With `host_key`, Conn3x accepts only that key and doesn't read the known_hosts file for the host. This suits servers created in the same plan, whose key you generate and install at creation:

```hcl
variable "web1_host_key" {
  type        = string
  description = "web1's SSH host public key, such as ssh-ed25519 AAAA..."
}

circuit "web" {
  hosts = {
    web1 = { address = "203.0.113.10", host_key = var.web1_host_key }
  }

  ssh {
    user = "root"
  }
}
```

The [Provision and configure](/guides/provision-and-configure) guide generates a host key with the `tls` provider and passes it to both the droplet and the circuit.

## become

With `become = true`, every command Conn3x runs on the host runs as root through `sudo`. The user in `user` needs permission to run commands with sudo, and sudo must not require a terminal (`requiretty`).

The first time Conn3x uses a host in a run, it asks whether sudo needs a password, by running `sudo -n true`:

- If sudo needs no password, Conn3x runs commands with `sudo -n`.
- If sudo needs a password, Conn3x reads it from `become_password_file`, checks it once with `sudo -v`, then passes it to `sudo -S` on standard input for each command. A trailing newline in the file is ignored. Without `become_password_file`, Conn3x stops with an error that says sudo needs a password.

The password goes from the file to the host and is never written to configuration, plans or state. The file's path is stored in state as part of the `ssh` block.

```hcl
circuit "db" {
  hosts = {
    db1 = "10.0.0.5"
  }

  ssh {
    user                 = "admin"
    become               = true
    become_password_file = "~/.config/conn3x/db-sudo-password"
  }
}
```

## Connecting and retries

When a host doesn't answer, because it refuses or resets the connection, is unreachable, or times out, Conn3x keeps trying until `timeout` has passed. This covers servers that are still booting. Each attempt waits up to 15 seconds. A host key that doesn't match and a login that the server rejects fail at once, without retrying. So does a name that DNS says doesn't exist, for the target or a jump host, so a typo costs you seconds rather than the whole `timeout`. A DNS lookup that times out is still retried.

Conn3x opens one SSH connection per host and login, and every step in the run shares it. Hosts reached through different jump hosts get separate connections.

Commands run with `/bin/sh` in the C locale (`LC_ALL=C`), so the output Conn3x reads is the same on every host.

## Where the ssh settings are stored

Each step instance records the `ssh` settings it used in state, and `conn3x state show` displays them. When a plan refreshes an instance, it connects with the settings in state. Changes are applied with the settings in the configuration. When you remove a step or a host, Conn3x uses the settings in state to reach the host and carry out [`on_remove`](/reference/circuits/removal).

Changing how Conn3x logs in isn't a change on the host. When only `user`, `private_key_file`, `host_key`, `known_hosts_file`, `jump_hosts`, `become`, `become_password_file` or `timeout` changes, each step keeps its [`revision`](/reference/circuits/handlers#the-revision-attribute), so handlers don't run. The host's address, `port` and `ssh_config_file` decide which machine Conn3x reaches, so changing one of those does count.

### Moving a host to another address or port

Changing a host's address replaces its steps: Conn3x removes each one from the old machine, following its [`on_remove`](/reference/circuits/removal), and applies it on the new one.

A new `port`, or an `ssh_config_file` that gives the host a new port or `HostName`, might reach the same machine or a different one. To tell which, Conn3x compares the host keys recorded for the old and new addresses, in `host_key` or the known_hosts file:

- **They share a key.** It's the same machine, such as sshd moving to another port, so the steps stay as they are.
- **They share none.** It's another machine behind the same address, so the plan replaces the steps, and `on_remove` runs on the old one.
- **Either address has no recorded key.** Conn3x can't tell, so the steps stay as they are. Connecting still checks the new address's key.

A plan refreshes each step with the settings in state, so it tries the old port first. If sshd no longer listens there, the refresh gives up after 10 seconds with a `Host not reachable during refresh` warning, the steps keep what the last apply recorded, and the plan moves them to the new port.
