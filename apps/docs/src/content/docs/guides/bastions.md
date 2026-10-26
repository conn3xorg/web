---
title: Reach hosts behind a bastion
description: Connect through jump hosts, and use the names in your SSH config.
---

Most private servers aren't reachable straight from your laptop. You go through a bastion, a jump host, and you probably already have the route written down in `~/.ssh/config`. Conn3x can take the same path.

## Through a jump host

List the hosts to go through in `jump_hosts`, in order, the way you'd pass them to `ssh -J`:

```hcl
circuit "app" {
  hosts = { app1 = "10.0.1.5", app2 = "10.0.1.6" }

  ssh {
    user       = "deploy"
    become     = true
    jump_hosts = ["deploy@bastion.example.com"]
  }

  step "agent" {
    package { name = "node-exporter" }
  }
}
```

Each entry is `[user@]host[:port]`. Leave out the user and it's the same as the `ssh` block's. Chain as many as you need: `["bastion.example.com", "10.0.0.5:2222"]` goes through both.

Every hop's host key is checked against your known_hosts file, just like the host itself, so connect to the bastion with `ssh` once first and confirm its fingerprint. All the hops use the same key, from `private_key_file` or your SSH agent.

## Using the names in your SSH config

If `~/.ssh/config` already says how to reach each host, point the `ssh` block at it and use the aliases as addresses:

```sshconfig
Host bastion
  HostName bastion.example.com

Host app1
  HostName 10.0.1.5
  User deploy
  ProxyJump bastion
```

```hcl
circuit "app" {
  hosts = { app1 = "app1" }

  ssh {
    ssh_config_file = "~/.ssh/config"
    become          = true
  }
}
```

Conn3x reads `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump` and `UserKnownHostsFile` for each alias. `ProxyJump bastion` names another entry, and Conn3x looks that one up in the same file, just as `ssh` would, so the bastion's address lives in one place. Anything you set in the `ssh` block wins over the file.

Conn3x only reads an SSH config when you set `ssh_config_file`. That's deliberate: a `Host *` entry in your personal config shouldn't quietly change where a plan connects, on your machine or anyone else's.
