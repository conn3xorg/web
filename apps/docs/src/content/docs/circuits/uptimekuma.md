---
title: Uptime Kuma
description: "Uptime Kuma under Podman: it watches your sites, ports and services and tells you the moment one stops answering."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-uptimekuma at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/uptimekuma/grade.svg)](https://conn3x.org/circuits/uptimekuma/grade)

A Conn3x circuit that runs [Uptime Kuma](https://uptime.kuma.pet), the self-hosted monitoring tool, on your own hosts. You add the websites, ports, DNS names and containers you care about in its dashboard, it checks each one on a schedule, and it tells you through email, Slack, ntfy, Telegram or any of about ninety other services the moment one stops answering. You can publish status pages from it too.

Uptime Kuma runs from its official image under Podman as a systemd service, pinned by tag and digest, and listens on `127.0.0.1:3001` for a reverse proxy in front. It keeps everything in SQLite under `/var/lib/uptime-kuma`. It runs on Debian, Ubuntu, Fedora and Rocky Linux.

> **Create the admin account straight away.** Uptime Kuma has no account until someone opens it, and the first person to load the page picks the username and password. With the default `listen_address`, that person has to be on the host already, or come through your reverse proxy. Open it once the apply finishes, before you put the proxy on a public address.

## Usage

```hcl
module "uptimekuma" {
  source = "github.com/conn3xorg/circuit-uptimekuma?ref=v0.1.0"

  hosts                = { monitor = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

Without a proxy, reach the dashboard over SSH: `ssh -L 3001:127.0.0.1:3001 root@192.168.1.50`, then open `http://localhost:3001` and create the admin.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-uptimekuma/tree/v0.1.0/examples/local).

### Behind a reverse proxy

Uptime Kuma speaks plain HTTP and WebSockets on `127.0.0.1:3001`. Put a proxy in front for TLS, such as [circuit-caddy](/circuits/caddy) on the same host, which passes WebSockets through without extra settings:

```hcl
module "caddy" {
  source = "github.com/conn3xorg/circuit-caddy?ref=v0.3.0"

  hosts                = { monitor = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  sites = {
    "status.example.com" = { reverse_proxy = ["127.0.0.1:3001"] }
  }
}
```

Then, in Uptime Kuma's settings, under Reverse Proxy, tell it to trust the proxy's headers, so the login log and rate limiter see your visitors' addresses rather than `127.0.0.1`.

### Watching the host it runs on

The container shares the host's network, so a monitor for `http://127.0.0.1:8080` checks a service on the host itself, and one for `192.168.1.1` goes out the host's own route. That's the reason for the host network, and it's why `listen_address` is a real address on the host.

A monitor for a Docker or Podman container needs the engine's socket, which this circuit doesn't mount. It would give Uptime Kuma root on the host. HTTP and port monitors cover most of what those would tell you.

## Why a container

Uptime Kuma's supported installs are its Docker image and a Node.js checkout run under pm2. This circuit uses the image:

- **It's what upstream tests.** The image carries the Node.js version Uptime Kuma is built against, the Chromium its Real Browser monitors use, and the tools behind its ping and DNS monitors.
- **One pin, checked.** `uptimekuma_version` and `image_digest` go into the unit together, and Podman pulls by the digest, so a tag that's re-pushed upstream can't change what your hosts run.
- **Upgrades are a diff.** Change both inputs and `conn3x plan` shows the new image in the unit file. The apply restarts Uptime Kuma on it, it migrates its database as it starts, and the apply waits for it to listen again.

Upstream publishes the same image, by the same digest, to GitHub's registry as `ghcr.io/louislam/uptime-kuma` and to Docker Hub as `louislam/uptime-kuma`. The circuit pulls from GitHub's registry, away from Docker Hub's limit on pulls without an account. The `-slim` tags leave out Chromium and the embedded MariaDB, at 176 MB compressed rather than 588. Set `uptimekuma_version = "2.5.9-slim"` with its own digest if you don't need Real Browser monitors.

## What it does

On each host, in order:

1. Creates `/var/lib/uptime-kuma`, mode `0700`, owned by root, for the SQLite database. The image runs as root, so nobody else on the host needs to get in.
2. Through [circuit-podman](/circuits/podman) v0.1.0, installs Podman and runs `ghcr.io/louislam/uptime-kuma:VERSION@DIGEST` as `uptime-kuma.service`: a Quadlet unit on the host network that mounts `/var/lib/uptime-kuma` as `/app/data` and sets `UPTIME_KUMA_HOST`, `UPTIME_KUMA_PORT` and `UPTIME_KUMA_DB_TYPE=sqlite`. The last one skips the screen that asks the first visitor which database to use.
3. Waits up to 15 minutes for Uptime Kuma to open its port, after a first start or any change that restarts it. A first start pulls the image, 588 MB compressed on amd64.

A change to any input restarts Uptime Kuma. Checks pause for those few seconds.

### What it doesn't do

- It doesn't create the admin account. Uptime Kuma only takes one through its setup page, over its WebSocket API; see the warning at the top.
- It doesn't set up TLS or a reverse proxy, or open a port in a firewall.
- It doesn't use MariaDB, embedded or your own. SQLite is plenty for one instance.
- It doesn't back anything up. Stop the service and copy `/var/lib/uptime-kuma`, or use [circuit-restic](/circuits/restic).
- It doesn't add monitors or notifications. Uptime Kuma keeps them in its database and has no config file to write them to.
- Deleting the module leaves Podman, the container and `/var/lib/uptime-kuma` in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.50"`, or a host object such as `{ address = "192.168.1.50", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `uptimekuma_version` | string | `"2.5.9"` | Tag of Uptime Kuma's image. Change `image_digest` with it. |
| `image_digest` | string | `"sha256:e88415a9..."` | Digest of the image for `uptimekuma_version`, the multi-architecture index. Podman pulls by the digest. Find it with `skopeo inspect docker://ghcr.io/louislam/uptime-kuma:TAG`. |
| `image_repository` | string | `"ghcr.io/louislam/uptime-kuma"` | Where to pull the image from. `"docker.io/louislam/uptime-kuma"` serves the same digests. |
| `listen_address` | string | `"127.0.0.1"` | Address Uptime Kuma listens on. `"0.0.0.0"` listens on every address. |
| `port` | number | `3001` | Port Uptime Kuma listens on. |

## Outputs

| Name | Description |
| --- | --- |
| `service` | The systemd service that runs Uptime Kuma, `uptime-kuma.service`. |
| `image` | The image the hosts run, with its tag and digest. |
| `url` | Where Uptime Kuma answers on the host itself, such as `http://127.0.0.1:3001`. Point a reverse proxy here. |
| `data_dir` | `/var/lib/uptime-kuma`, the directory to back up. |

## Requirements

Requires Conn3x v0.7.0 or later and systemd on each host. The image is built for amd64, arm64 and armv7. Each host needs to reach its package mirror and `ghcr.io`. `conn3x init` fetches circuit-podman from GitHub.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13, in local containers from Conn3x's test images on arm64. CI does the same on amd64. Each applies [examples/local](https://github.com/conn3xorg/circuit-uptimekuma/tree/v0.1.0/examples/local) with Uptime Kuma 2.5.8 and plans again with no changes. [`check.js`](https://github.com/conn3xorg/circuit-uptimekuma/blob/v0.1.0/examples/local/check.js) then creates the admin over the socket.io API the dashboard uses, checks a wrong password is refused, and adds two HTTP monitors: one for Uptime Kuma itself, which has to report up, and one for a closed port, which has to report down. Then the upgrade: the apply moves to 2.5.9, the plan is clean, and the admin logs in again and both monitors report the same. Then the host container restarts, which boots systemd again, and the same check passes and the plan is clean.

By hand, on two DigitalOcean droplets with 1 GB of memory, on amd64: Ubuntu 24.04, and Rocky Linux 10 with SELinux enforcing. Each ran this circuit alongside circuit-homepage and circuit-dockge. On each, the second plan was clean and the same check passed; port 3001 didn't answer from outside; after a reboot Uptime Kuma came back on its own, the check passed again and the plan was clean. Neither droplet had an out-of-memory kill, with about 250 MiB still available with all three running, and Rocky's audit log had no SELinux denials.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-uptimekuma/blob/v0.1.0/LICENSE). Uptime Kuma itself is under the MIT license.

## Source

- Repository: [conn3xorg/circuit-uptimekuma](https://github.com/conn3xorg/circuit-uptimekuma). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-uptimekuma/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-uptimekuma/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-uptimekuma/tree/v0.1.0/examples/local).
- Related circuits: [Caddy](/circuits/caddy), [Podman](/circuits/podman), [restic](/circuits/restic), [node_exporter](/circuits/node-exporter), [Prometheus](/circuits/prometheus), [Grafana](/circuits/grafana), [Monitoring stack](/circuits/monitoring), [Netdata](/circuits/netdata), [OpenTelemetry Collector](/circuits/otelcol), [Zabbix](/circuits/zabbix), [Nagios Core](/circuits/nagios).
