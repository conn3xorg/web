---
title: Dockge
description: "Dockge under Podman: write, deploy and update compose stacks from the browser, with no Docker engine."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-dockge at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/dockge/grade.svg)](https://conn3x.org/circuits/dockge/grade)

A Conn3x circuit that runs [Dockge](https://dockge.kuma.pet), the web page for Docker Compose stacks, on your own hosts. You paste or write a `compose.yaml` in the browser, press Deploy, and watch the output; then start, stop, update and edit each stack from the same page. The files stay ordinary compose files in `/opt/stacks`, one folder per stack, so you can still run `docker compose` on them yourself, or walk away from Dockge without losing anything.

Dockge runs from its official image under Podman as a systemd service, pinned by tag and digest, and listens on `127.0.0.1:5001` for a reverse proxy in front. It runs on Debian, Ubuntu, Fedora and Rocky Linux.

> **Dockge is root on the host.** It runs `docker compose` against Podman's API socket, and anyone who can deploy a stack can mount `/` into a container. Treat its login like a root password, and create the admin straight after the apply: Dockge has no account until someone opens it, and the first person to load the page picks the username and password. With the default `listen_address`, that person has to be on the host already, or come through your reverse proxy.

## Usage

```hcl
module "dockge" {
  source = "github.com/conn3xorg/circuit-dockge?ref=v0.1.0"

  hosts                = { apps = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

Without a proxy, reach Dockge over SSH: `ssh -L 5001:127.0.0.1:5001 root@192.168.1.50`, then open `http://localhost:5001` and create the admin.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-dockge/tree/v0.1.0/examples/local).

### Behind a reverse proxy

Dockge speaks plain HTTP and WebSockets on `127.0.0.1:5001`. Put a proxy in front for TLS, such as [circuit-caddy](/circuits/caddy) on the same host, which passes WebSockets through without extra settings:

```hcl
module "caddy" {
  source = "github.com/conn3xorg/circuit-caddy?ref=v0.3.0"

  hosts                = { apps = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  sites = {
    "dockge.example.com" = { reverse_proxy = ["127.0.0.1:5001"] }
  }
}
```

## Podman, not Docker

Dockge is written for Docker. This circuit runs it against Podman instead, and doesn't install the Docker engine. Here's why, and what that means.

Dockge doesn't talk to Docker itself. It runs the `docker` and `docker compose` commands that ship in its image, and they talk to whatever answers on `/var/run/docker.sock`. Podman serves the same API on `/run/podman/podman.sock` through `podman.socket`, and the circuit mounts that socket at Docker's path. So your stacks run as rootful Podman containers: `podman ps` on the host lists them, named the way Compose names them, such as `hello-web-1`.

That's what was tested, end to end, on all four distributions: deploying a stack from Dockge, Dockge reading its status back, the stack's port answering on a bridge network, and the stack coming back after an upgrade of Dockge and a reboot of the host. What wasn't tried is the long tail of Compose: `build:`, healthcheck-based `depends_on`, GPU reservations, `network_mode: service:...` and so on. Podman's Docker API covers most of it, but it isn't Docker, and a stack that leans on a Docker-only feature can fail where it wouldn't on Docker. If you need exactly Docker's behaviour, run Dockge yourself next to [circuit-docker](/circuits/docker) instead.

Things that differ from a Docker host:

- **Coming back after a reboot.** Docker's daemon starts every container with `restart: always` or `unless-stopped` as it boots. Podman has no daemon, so the circuit turns on `podman-restart.service`, which does the same. The Podman on Rocky Linux 10 and Fedora 45 handles both policies the way Docker does. Ubuntu 24.04's Podman 4.9 and Debian 13's 5.4 only start `restart: always` containers, so the circuit adds a drop-in that also starts `unless-stopped` ones on those. They don't record which containers you stopped by hand, so there a stopped `unless-stopped` stack comes back at boot too. A stack with no `restart:` stays down after a reboot, as on Docker.
- **SELinux.** On Rocky Linux and Fedora, a bind mount from the host, such as `./data:/data`, needs `:z` on the end (`./data:/data:z`), or SELinux stops the container reading it. Docker on those hosts needs the same. Named volumes need nothing.
- **Firewalls.** Ports a stack publishes get Podman's own firewall rules, which ufw and firewalld don't see, much as with Docker. Publish on `127.0.0.1:PORT:...` for anything that should stay behind a proxy.

## Why a container

Dockge's only supported install is its image. The circuit pins it:

- **One pin, checked.** `dockge_version` and `image_digest` go into the unit together, and Podman pulls by the digest, so a tag that's re-pushed upstream can't change what your hosts run.
- **Upgrades are a diff.** Change both inputs and `conn3x plan` shows the new image in the unit file. The apply restarts Dockge on it and waits for it to listen again. Your stacks keep running through it: they're separate containers.

Upstream publishes the image only on Docker Hub, as `louislam/dockge`, so each host pulls from Docker Hub, which limits pulls without an account. The container uses the host's network, so `listen_address` is a real address on the host.

## What it does

On each host, in order:

1. Installs Podman, starts `podman.socket` and enables it at boot.
2. Enables `podman-restart.service`, and writes `/etc/systemd/system/podman-restart.service.d/50-conn3x-unless-stopped.conf`, which starts `unless-stopped` containers at boot when the packaged unit doesn't.
3. Creates `/var/lib/dockge` for Dockge's database and `stacks_dir` for the stacks, both mode `0700`, owned by root. A stack's `.env` can hold its secrets.
4. Through [circuit-podman](/circuits/podman) v0.1.0, runs `docker.io/louislam/dockge:VERSION@DIGEST` as `dockge.service`: a Quadlet unit on the host network that mounts Podman's socket as `/var/run/docker.sock`, `/var/lib/dockge` as `/app/data`, and `stacks_dir` at the same path inside, and sets `DOCKGE_HOSTNAME`, `DOCKGE_PORT` and `DOCKGE_STACKS_DIR`. SELinux labelling is off for this one container, since it needs the socket.
5. Waits up to 15 minutes for Dockge to open its port, after a first start or any change that restarts it. A first start pulls the image, 251 MB compressed on amd64.

### What it doesn't do

- It doesn't create the admin account. Dockge only takes one through its setup page; see the warning at the top.
- It doesn't set up TLS, a reverse proxy or a firewall rule.
- It doesn't deploy any stacks. Do that in Dockge, or drop a folder with a `compose.yaml` into `stacks_dir` and Dockge lists it.
- It doesn't connect other Dockge instances as agents, or turn on Dockge's console.
- It doesn't back anything up. `stacks_dir` and `/var/lib/dockge` hold everything Dockge knows; the stacks' own data is wherever their compose files put it. See [circuit-restic](/circuits/restic).
- Deleting the module leaves Podman, the containers, the socket and both directories in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.50"`, or a host object such as `{ address = "192.168.1.50", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `stacks_dir` | string | `"/opt/stacks"` | Directory holding a folder per stack. Dockge sees it at the same path, since Compose resolves relative bind mounts there. |
| `dockge_version` | string | `"1.5.0"` | Tag of Dockge's image. Change `image_digest` with it. |
| `image_digest` | string | `"sha256:335c6368..."` | Digest of the image for `dockge_version`, the multi-architecture index. Podman pulls by the digest. Find it with `skopeo inspect docker://docker.io/louislam/dockge:TAG`. |
| `image_repository` | string | `"docker.io/louislam/dockge"` | Where to pull the image from, such as a mirror of your own. |
| `listen_address` | string | `"127.0.0.1"` | Address Dockge listens on. `"0.0.0.0"` listens on every address. |
| `port` | number | `5001` | Port Dockge listens on. |

## Outputs

| Name | Description |
| --- | --- |
| `service` | The systemd service that runs Dockge, `dockge.service`. |
| `image` | The image the hosts run, with its tag and digest. |
| `url` | Where Dockge answers on the host itself, such as `http://127.0.0.1:5001`. Point a reverse proxy here. |
| `stacks_dir` | The stacks directory, to back up with `/var/lib/dockge`. |

## Requirements

Requires Conn3x v0.7.0 or later and systemd on each host. The image is built for amd64, arm64 and armv7. Each host needs to reach its package mirror and Docker Hub, and whatever registries its stacks pull from. `conn3x init` fetches circuit-podman from GitHub.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13, in local containers from Conn3x's test images on arm64. CI does the same on amd64. Each applies [examples/local](https://github.com/conn3xorg/circuit-dockge/tree/v0.1.0/examples/local) with Dockge 1.4.2 and plans again with no changes. [`check.js`](https://github.com/conn3xorg/circuit-dockge/blob/v0.1.0/examples/local/check.js) then creates the admin over the socket.io API the page uses, checks a wrong password is refused, and deploys a stack with one nginx on a bridge network, published on `127.0.0.1:18080`. It waits until Dockge reports the stack running and nginx answers, and `podman ps` on the host shows the container. Then the upgrade to 1.5.0, a clean plan, and the same check finds the stack still running. Then the host container restarts, which boots systemd again: Dockge comes back, `podman-restart.service` brings the stack back, with the drop-in on Ubuntu and Debian, and the check passes and the plan is clean.

By hand, on two DigitalOcean droplets with 1 GB of memory, on amd64: Ubuntu 24.04, and Rocky Linux 10 with SELinux enforcing. Each ran this circuit alongside circuit-homepage and circuit-dockge. On each, the second plan was clean and the same check passed; ports 5001 and 18080 didn't answer from outside; after a reboot Dockge and the stack came back on their own, the check passed again and the plan was clean. Neither droplet had an out-of-memory kill, with about 250 MiB still available with all three running, and Rocky's audit log had no SELinux denials. Dockge's image and the nginx image pulled from Docker Hub without hitting its limit, on both.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-dockge/blob/v0.1.0/LICENSE). Dockge itself is under the MIT license.

## Source

- Repository: [conn3xorg/circuit-dockge](https://github.com/conn3xorg/circuit-dockge). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-dockge/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-dockge/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-dockge/tree/v0.1.0/examples/local).
- Related circuits: [Caddy](/circuits/caddy), [Docker](/circuits/docker), [Podman](/circuits/podman), [restic](/circuits/restic), [k3s](/circuits/k3s), [kubeadm](/circuits/kubeadm), [MicroShift](/circuits/microshift), [Rancher](/circuits/rancher), [containerd](/circuits/containerd), [Nomad](/circuits/nomad), [Helm](/circuits/helm), [Istio](/circuits/istio), [Flux](/circuits/flux), [Portainer CE](/circuits/portainer).
