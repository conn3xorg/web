---
title: Reach hosts through a bastion
description: Configure servers on a private network through a jump host, set connection details per host with host objects, and move the route into an SSH config file.
---

In this tutorial you'll configure two servers that you can only reach through a bastion. You'll route the circuit through the bastion with `jump_hosts`, bring the bastion itself into the same circuit with host objects, and then move the route into an SSH config file.

**Time:** 15 minutes.

## Prerequisites

- Conn3x v0.6.0 [installed](/install), and [Configure your first real server](/tutorials/first-server) done, or the same knowledge of circuits and the `ssh` block.
- A bastion you can reach over SSH. This tutorial uses `bastion.example.com`.
- Two Linux servers that the bastion can reach on port 22. This tutorial uses `10.0.1.5` and `10.0.1.6`.
- A user called `admin` on all three machines, with passwordless `sudo` and your key `~/.ssh/id_ed25519` in its `authorized_keys`. Every hop uses the same key.
- TCP forwarding allowed on the bastion. It's on by default in OpenSSH (`AllowTcpForwarding yes`).

## Record the host keys

Conn3x checks the host key of every hop, the bastion included, against `~/.ssh/known_hosts`. Log in to each server through the bastion once with `ssh -J`, and confirm each fingerprint when asked:

```sh
ssh -J admin@bastion.example.com admin@10.0.1.5 true
ssh -J admin@bastion.example.com admin@10.0.1.6 true
```

This records the bastion's key and both servers' keys. If a key is missing, Conn3x stops before it connects:

```text
ssh 127.0.0.1:2224: ssh: handshake failed: host key verification failed:
127.0.0.1:2224 is not in ./known_hosts; verify its key and add it, for
example with ssh-keyscan
```

That error came from a test bastion on `127.0.0.1:2224` with its own `known_hosts` file. Yours names your bastion and `~/.ssh/known_hosts`.

## Route the circuit through the bastion

Create a directory with `main.circuit.hcl` in it:

```hcl
circuit "app" {
  hosts = { app1 = "10.0.1.5", app2 = "10.0.1.6" }

  ssh {
    user             = "admin"
    private_key_file = "~/.ssh/id_ed25519"
    become           = true
    jump_hosts       = ["admin@bastion.example.com"]
  }

  step "motd" {
    file {
      path    = "/etc/motd"
      content = "${each.key}: reached through the bastion.\n"
    }
  }
}
```

`jump_hosts` lists the hosts to go through, in order, in the same `[user@]host[:port]` form as `ssh -J`. Each host's address in `hosts` is the address the bastion connects to, so private addresses are fine.

Initialize and apply:

```sh
conn3x init
conn3x apply
```

Type `yes`. Both servers are configured at the same time:

```text
Plan: 2 to add, 0 to change, 0 to destroy.
conn3x_file.app__motd["app2"]: Creating...
conn3x_file.app__motd["app1"]: Creating...
```

```text
Apply complete! Resources: 2 added, 0 changed, 0 destroyed.
```

Conn3x opens one connection through the bastion for each host and reuses it for every step in the run.

## Add the bastion with host objects

The bastion needs configuring too, but it can't jump through itself. A value in `hosts` can be a host object instead of an address, and its connection fields override the `ssh` block for that host. While you're here, give each machine a role for the message of the day.

Replace `main.circuit.hcl`:

```hcl
locals {
  roles = {
    bastion = "bastion"
    app1    = "primary"
    app2    = "replica"
  }
}

circuit "app" {
  hosts = {
    bastion = { address = "bastion.example.com", jump_hosts = [] }
    app1    = "10.0.1.5"
    app2    = "10.0.1.6"
  }

  ssh {
    user             = "admin"
    private_key_file = "~/.ssh/id_ed25519"
    become           = true
    jump_hosts       = ["admin@bastion.example.com"]
  }

  step "motd" {
    file {
      path    = "/etc/motd"
      content = "${each.key} (${local.roles[each.key]}), managed by Conn3x.\n"
    }
  }
}
```

- `jump_hosts = []` on the bastion connects to it directly. The other two still go through it.
- The roles live in `local.roles`, and the step looks each one up with `each.key`. They can't go in the host objects: a host object takes connection settings only, and `validate` rejects any other field.

[Host object fields](/reference/circuits/hosts#host-object-fields) lists the five settings a host object can override: `user`, `port`, `private_key_file`, `host_key` and `jump_hosts`.

Plan:

```sh
conn3x plan
```

```text
  # conn3x_file.app__motd["app1"] will be updated in-place
  # conn3x_file.app__motd["app2"] will be updated in-place
  # conn3x_file.app__motd["bastion"] will be created
```

```text
          - app1: reached through the bastion.
          + app1 (primary), managed by Conn3x.
```

```text
Plan: 1 to add, 2 to change, 0 to destroy.
```

The host keys stay `app1` and `app2`, so the existing steps update in place. Apply it with `conn3x apply`.

## Use an SSH config file instead

If your team already keeps the route in an OpenSSH config file, Conn3x can read it. It only reads a config file when you name one in `ssh_config_file`, so a `Host *` entry in someone's personal `~/.ssh/config` can't change where a plan connects.

Create `ssh_config` next to the circuit:

```sshconfig
Host bastion
  HostName bastion.example.com
  User admin
  IdentityFile ~/.ssh/id_ed25519

Host app1
  HostName 10.0.1.5

Host app2
  HostName 10.0.1.6

Host app*
  User admin
  IdentityFile ~/.ssh/id_ed25519
  ProxyJump bastion
```

Then use the aliases as addresses, and point the `ssh` block at the file:

```hcl
circuit "app" {
  hosts = { app1 = "app1", app2 = "app2" }

  ssh {
    ssh_config_file = "./ssh_config"
    become          = true
  }

  step "motd" {
    file {
      path    = "/etc/motd"
      content = "${each.key}: route read from ssh_config.\n"
    }
  }
}
```

Conn3x looks up each address as a `Host` alias and reads `HostName`, `User`, `Port`, `IdentityFile`, `UserKnownHostsFile` and `ProxyJump`. Wildcard patterns such as `app*` work. Anything set in the `ssh` block or a host object wins over the file. The full rules are in [SSH config files](/reference/circuits/ssh#ssh-config-files).

`ProxyJump bastion` names the `Host bastion` entry, and Conn3x looks that up in the same file, as `ssh` does, for its `HostName`, `User`, `Port` and `IdentityFile`. The bastion's address is written once, and `ssh -F ssh_config app1` from your terminal takes the same route as Conn3x.

The addresses in `hosts` changed from IP addresses to aliases, so this circuit's steps have new IDs. Destroy the previous circuit's steps before switching, or start in a new directory. Then apply:

```sh
conn3x apply
```

```text
Apply complete! Resources: 2 added, 0 changed, 0 destroyed.
```

## Clean up

```sh
conn3x destroy
```

Type `yes`. Destroy removes the steps from state and leaves `/etc/motd` as it is on each server, because `file` defaults to `on_remove = "forget"`. Delete or edit `/etc/motd` by hand if you don't want to keep it.

## Next steps

- [Keep secrets out of state](/tutorials/secrets).
- [Reach hosts behind a bastion](/guides/bastions) is the short version of this page.
- [The ssh block](/reference/circuits/ssh) lists every connection setting and the order they're applied in.
