---
title: "Through the bastion"
description: "Your servers sit on a private network, and the only way in is a jump host. Here's how Conn3x takes that route: jump_hosts, host objects for the bastion itself, and the SSH config file you already keep."
date: 2026-12-13
author: James Conway
image: /media/blog/through-the-bastion/card.png
imageAlt: "A laptop connecting through a bastion to two private servers, with the host key checked at every hop."
---

The servers worth protecting are the ones you can't reach. They live on `10.0.1.0/24`, behind a bastion that's the only machine with a public address, and every tool you point at them has to learn the route.

You've written that route before. Ansible wanted it as `ansible_ssh_common_args='-o ProxyJump=...'`. Terraform's `connection` block wanted `bastion_host`, `bastion_user` and `bastion_private_key`. Your terminal wanted three lines in `~/.ssh/config`. Same bastion, three spellings.

Conn3x asks for it once, in the form you already type.

<figure>
  <a href="/media/blog/through-the-bastion/routes.png">
    <img src="/media/blog/through-the-bastion/routes.png" width="1600" height="1240" loading="lazy" decoding="async" alt="Three ways to write the route. One: jump_hosts in the ssh block, written like ssh -J. Two: a host object that overrides the route for one host, such as jump_hosts = [] for the bastion itself. Three: ssh_config_file, which reads the aliases you already have. Every hop's host key is checked." />
  </a>
  <figcaption>Three ways to write the route. Settings in the circuit win over the file.</figcaption>
</figure>

<details>
<summary>Read the diagram as text</summary>

- **In the ssh block:** `jump_hosts = ["admin@bastion.example.com"]` sends every host in the circuit through the bastion, written like `ssh -J`.
- **Per host:** a host object overrides the route for one host. `jump_hosts = []` connects to that host directly, which is how the bastion itself gets configured.
- **From a file:** `ssh_config_file = "./ssh_config"` reads `HostName`, `User`, `Port`, `IdentityFile`, `UserKnownHostsFile` and `ProxyJump` for each alias. Conn3x reads no SSH config unless you name one.
- **Every hop is checked:** the bastion's host key and each server's are verified against your known_hosts file, with no setting to skip it. One connection per host goes through the bastion, and every step shares it.

</details>

## One line in the ssh block

`jump_hosts` takes the hosts to go through, in order, written the way you'd pass them to `ssh -J`:

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

The addresses in `hosts` are the ones the bastion sees, so private IPs are fine. Need two hops? `["bastion.example.com", "10.0.0.5:2222"]` goes through both, in that order.

What you don't get is a way to skip the host key check. Conn3x verifies the key of every hop against your known_hosts file, the bastion included, and there's no setting to turn that off. So before your first plan, log in once with `ssh -J` and confirm each fingerprint. If a key is missing, the plan stops before it connects, and the error tells you which address to check.

Then `conn3x apply`, and both servers are configured at the same time. Conn3x opens one connection through the bastion per host and every step in the run shares it, so a circuit with forty steps doesn't knock on the bastion forty times.

## The bastion needs configuring too

Here's the awkward part every bastion setup hits eventually. The bastion is a server. It wants its packages patched and its sshd hardened like the rest. But it can't jump through itself.

A value in `hosts` can be a host object instead of an address, and its connection fields override the `ssh` block for that one host:

```hcl
hosts = {
  bastion = { address = "bastion.example.com", jump_hosts = [], role = "bastion" }
  app1    = { address = "10.0.1.5", role = "primary" }
  app2    = { address = "10.0.1.6", role = "replica" }
}
```

`jump_hosts = []` means "connect directly". The other two still go through it. And `role` isn't a connection setting at all: fields Conn3x doesn't recognise are yours, and steps read them as `each.value.role`. One circuit, three machines, two routes.

## Or keep the route where it already lives

Most teams already have the route written down in an OpenSSH config file, checked in next to the infrastructure. Point the `ssh` block at it and use the aliases as addresses:

```sshconfig
Host bastion
  HostName bastion.example.com
  User admin

Host app*
  User admin
  ProxyJump bastion
```

```hcl
ssh {
  ssh_config_file = "./ssh_config"
  become          = true
}
```

Conn3x looks each address up as a `Host` alias and reads `HostName`, `User`, `Port`, `IdentityFile`, `UserKnownHostsFile` and `ProxyJump`. `ProxyJump bastion` is looked up in the same file, the way `ssh` does it, so the bastion's address is written exactly once. Wildcards like `app*` work. And `ssh -F ssh_config app1` from your terminal now takes the same route Conn3x does, which is what you want when something breaks at 2 a.m.

One thing it won't do is read your personal `~/.ssh/config` unless you ask. That's on purpose. A `Host *` line on one teammate's laptop shouldn't change where a plan connects, so the file is used only when the circuit names it.

## Moving the bastion doesn't restart anything

Bastions get replaced. When yours moves, you change one entry in `jump_hosts`, and the next plan reaches the same servers by a new road.

Nothing on those servers has changed, and Conn3x knows it. A change to how it logs in, whether that's `jump_hosts`, `user`, the key or `become`, keeps each step's `revision` as it was, so handlers don't fire. You can swap the bastion on a Tuesday afternoon without nginx restarting on every host behind it.

Change the target's own address or port, though, and that does count, because it might be a different machine. For a port change, Conn3x compares the host keys recorded for the old and new addresses to tell the two cases apart.

## Try it

The [bastion tutorial](https://docs.conn3x.org/tutorials/bastion) walks through all three setups in 15 minutes, with the output you should see at each step. [The ssh block reference](https://docs.conn3x.org/reference/circuits/ssh) has every setting and the order they're applied in.

If your route is stranger than these (three hops, a different key per hop, a bastion on a non-standard port), I'd like to hear how it goes. [Open a discussion](https://github.com/conn3xorg/conn3x/discussions) and tell us what you're connecting through.
