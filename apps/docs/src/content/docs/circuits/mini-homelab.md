---
title: Mini homelab
description: "Homepage and Uptime Kuma on one server, on loopback behind an SSH tunnel: the small circuit the private AI box tutorial builds."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-mini-homelab at v0.1.1. -->

[![Conn3x grade](https://conn3x.org/circuits/mini-homelab/grade.svg)](https://conn3x.org/circuits/mini-homelab/grade)

A Conn3x circuit that runs Homepage and Uptime Kuma on one server. Homepage gives you a page of tiles, one for Uptime Kuma with a dot that goes red when it stops answering, and one for every link you add. Uptime Kuma watches whatever else you point it at. Both listen on `127.0.0.1`, so nothing new faces your network, and you reach them through an SSH tunnel.

It's small on purpose. This is the circuit you build line by line in part 2 of [Build a private AI box, step by step](/tutorials/private-ai-box#part-2-make-your-own-circuit): two official circuits and one step of its own, short enough to read before you run it as root.

It's a cut-down version of [circuit-lempa-homelab](/circuits/lempa-homelab), which is named after [Christian Lempa](https://christianlempa.de/) and built from the list in his video [What software runs in my HomeLab in 2025?](https://www.youtube.com/watch?v=KJVe_E6tdzw). This one keeps two apps from its monitoring and dashboard chapters. Christian didn't make either circuit and doesn't endorse them, and nothing in them is copied from his own files.

## Usage

```hcl
module "homelab" {
  source = "github.com/conn3xorg/circuit-mini-homelab?ref=v0.1.1"

  hosts                = { lab = "192.168.1.20" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  links = { Router = "http://192.168.1.1" }
}
```

Then `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

Open a tunnel, and keep it open while you look:

```sh
ssh -N -L 3000:127.0.0.1:3000 -L 3001:127.0.0.1:3001 root@192.168.1.20
```

Go to `http://localhost:3001` first. Uptime Kuma has no account until someone opens it, and whoever loads the page first picks the login, so create yours straight after the first apply. Homepage is at `http://localhost:3000`.

Log in to the server and `/etc/motd` tells you the same thing, in case you forget which port was which.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-mini-homelab/tree/v0.1.1/examples/local).

## What it does

On the host:

1. Runs [circuit-uptimekuma](/circuits/uptimekuma) v0.1.0 on `127.0.0.1:3001`.
2. Runs [circuit-homepage](/circuits/homepage) v0.1.0 on `127.0.0.1:3000`, titled `title`, with an Apps group holding Uptime Kuma and its status dot, and a Links group for `links`. With no `links`, there's no Links group.
3. Writes `/etc/motd`, saying what runs there and how to reach it.

Both apps run from their official images, pinned by tag and digest, under Podman as systemd services. Each member circuit installs Podman for itself, and asking twice changes nothing. Removing the circuit leaves both apps, and `/etc/motd`, in place.

## When you want more

Want Traefik with a name for each app, BIND, Prometheus and Grafana, or a switch for smart home, AI and the rest? That's [circuit-lempa-homelab](/circuits/lempa-homelab). It runs the same Homepage and Uptime Kuma circuits, so don't point both at one server: they'd manage the same files.

For Homepage widgets, bookmarks or another port, call [circuit-homepage](/circuits/homepage) yourself. Its README lists every input this circuit leaves at its default.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | The homelab server: a map of one name to an address or a host object. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Private key. When null, the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file. When null, `~/.ssh/known_hosts`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. |
| `title` | string | `"Homelab"` | Homepage's browser tab title, and the first line of the login message. |
| `links` | map(string) | `{}` | More tiles for Homepage, by name. |

## Outputs

| Name | Description |
| --- | --- |
| `urls` | Where each app answers on the server itself, such as `{ homepage = "http://127.0.0.1:3000" }`. |
| `tunnel_ports` | The `-L` arguments for `ssh` that bring both apps to the same ports on your machine. |

## Requirements

Requires Conn3x v0.7.0 or later and systemd on the host, which needs to reach its package mirror and `ghcr.io`. Both images are built for amd64 and arm64. `conn3x init` fetches the member circuits from GitHub.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13, in CI on amd64, in containers from Conn3x's test images, with the latest Conn3x release. Each run applies [examples/local](https://github.com/conn3xorg/circuit-mini-homelab/tree/v0.1.1/examples/local), and the second plan is clean. Then [`check.sh`](https://github.com/conn3xorg/circuit-mini-homelab/blob/v0.1.1/examples/local/check.sh) fetches both apps from the host, the way your tunnel would: Homepage's page with its title, both groups and their tiles from its API, and its own check on Uptime Kuma coming back 200; Uptime Kuma's dashboard and its socket.io; and the lines in `/etc/motd`. The host container restarts, which boots systemd again, and the check passes and the plan is clean.

By hand, Rocky Linux 10 on arm64, in the same container on a Mac under rootful Podman, with Conn3x v0.7.2: 22 resources, the same check before and after a restart, and a clean plan each time.

This is the first release, so there's no upgrade to test yet.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-mini-homelab/blob/v0.1.1/LICENSE). Homepage is GPL-3.0 and Uptime Kuma is MIT; the member circuits' READMEs say more.

## Source

- Repository: [conn3xorg/circuit-mini-homelab](https://github.com/conn3xorg/circuit-mini-homelab). This page covers [v0.1.1](https://github.com/conn3xorg/circuit-mini-homelab/tree/v0.1.1); the repository's [tags](https://github.com/conn3xorg/circuit-mini-homelab/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-mini-homelab/tree/v0.1.1/examples/local).
- Related circuits: [Lempa homelab](/circuits/lempa-homelab), [Uptime Kuma](/circuits/uptimekuma), [Homepage](/circuits/homepage), [Proxmox VE](/circuits/proxmox), [Forgejo](/circuits/forgejo), [GitLab CE](/circuits/gitlab), [Cockpit](/circuits/cockpit), [n8n](/circuits/n8n), [Fleet](/circuits/fleet), [Home Assistant](/circuits/homeassistant), [Kestra](/circuits/kestra).
