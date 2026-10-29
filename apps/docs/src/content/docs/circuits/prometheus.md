---
title: Prometheus
description: "Prometheus from the official release, scraping the targets you list, with each config checked by promtool and reloaded in place."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-prometheus at v0.1.0. -->

A Conn3x circuit that installs a [Prometheus](https://prometheus.io) server on your hosts and keeps it running. It downloads a pinned release, checks its SHA-256 before using it, and runs it under systemd as its own `prometheus` user. You give it the targets to scrape, the scrape interval and how long to keep data, and it writes `/etc/prometheus/prometheus.yml` from them.

A config change doesn't restart Prometheus. The circuit checks the new file with `promtool` first, puts it in place only if it passes, and then reloads Prometheus, so scraping carries on and a typo never reaches the running server.

## Usage

```hcl
module "node_exporter" {
  source = "github.com/conn3xorg/circuit-node-exporter?ref=v0.1.0"

  hosts                = { web1 = "203.0.113.10", web2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}

module "prometheus" {
  source = "github.com/conn3xorg/circuit-prometheus?ref=v0.1.0"

  hosts                = { mon1 = "203.0.113.20" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  scrape_interval = "30s"
  retention       = "30d"
  scrape_targets = {
    node = ["203.0.113.10:9100", "203.0.113.11:9100"]
  }
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

Prometheus listens on `127.0.0.1:9090` by default, so its UI and API are only reachable from the host itself. To look at it from your desk, use an SSH tunnel:

```sh
ssh -L 9090:127.0.0.1:9090 root@203.0.113.20
```

and open <http://localhost:9090>. To serve it on the network instead, set `listen_address = ":9090"` and open the port to the people who need it. Prometheus has no login of its own.

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry:

```hcl
hosts = {
  for name, d in digitalocean_droplet.mon : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-prometheus/tree/v0.1.0/examples/local). It runs node_exporter from circuit-node-exporter next to Prometheus and scrapes it.

### Rocky Linux and port 9090

Rocky Linux cloud images turn on `cockpit.socket`, which holds port 9090 on every address. Prometheus can't bind 9090 next to it, and the apply fails at the ready check with a message saying so. Either move Prometheus with `listen_address = "127.0.0.1:9091"`, or, if you don't use Cockpit, run `systemctl disable --now cockpit.socket` on the host first. The circuit doesn't touch Cockpit itself.

## What it does

On each host, in order:

1. Installs `curl`, `tar` and `gzip` if they're missing.
2. Creates the `prometheus` system user, with no login shell, and its data directory, `/var/lib/prometheus`.
3. Downloads `prometheus-VERSION.linux-ARCH.tar.gz` from the GitHub release into `/opt/prometheus`. If the checksum doesn't match `checksums`, the apply fails and nothing is unpacked. Then unpacks it to `/opt/prometheus/prometheus-VERSION.linux-ARCH/`.
4. Writes the configuration to `/etc/prometheus/prometheus.yml.conn3x`, runs `promtool check config` on it and, when that passes, copies it to `/etc/prometheus/prometheus.yml`. If Prometheus is already running, it reloads it with `systemctl reload`, which sends it `SIGHUP`. If `promtool` fails, the apply stops there and the live file stays as it was.
5. Writes `/etc/systemd/system/prometheus.service`, and restarts Prometheus when that file changes.
6. Starts Prometheus now and at boot, and waits until it answers on `/-/ready`.

The configuration has a `global` section with `scrape_interval`, which is also the rule evaluation interval, a `prometheus` job that scrapes Prometheus itself, and one job for each entry in `scrape_targets`. Each job's targets go in a `static_configs` block, and Prometheus scrapes `http://TARGET/metrics`.

If someone edits `/etc/prometheus/prometheus.yml` by hand, the next plan shows the `config` step out of sync, and the apply puts the file back and reloads Prometheus.

Before the circuit runs, the `conn3x_host` data source reads each host's architecture over SSH. `x86_64` maps to `amd64` and `aarch64` to `arm64`; other architectures fail the plan.

### What it doesn't do

- It doesn't write alerting or recording rules, or set up Alertmanager.
- It doesn't do service discovery, relabelling, TLS or basic auth for targets. Every job is a static list scraped over plain HTTP on `/metrics`.
- It doesn't open a firewall port, and it doesn't install anything on the targets. circuit-node-exporter puts node_exporter on them.
- Deleting the module leaves Prometheus installed and running with the last configuration, and its data in `/var/lib/prometheus`.

### Upgrading

Set `prometheus_version` and `checksums` together. Take both checksums from the release's `sha256sums.txt`:

```hcl
module "prometheus" {
  source = "github.com/conn3xorg/circuit-prometheus?ref=v0.1.0"

  hosts              = { mon1 = "203.0.113.20" }
  prometheus_version = "3.15.1"
  checksums = {
    amd64 = "6a726885328ad9efebbf36e876ce2fb6225468a71fd1e7ce3ba666d5f4d97a84"
    arm64 = "ceb6d21493c37ca0b4513b147642797c68cf39a0f50a444d50e1e80c74f21b26"
  }
}
```

The new release unpacks beside the old one, the unit file points at it, and Prometheus restarts on the same data directory. The old directory stays until you remove it. Read the release notes before a major version: Prometheus 3 changed some defaults and flags from 2.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `prometheus_version` | string | `"3.15.1"` | Prometheus release to install, without the leading `v`. |
| `checksums` | map(string) | The 3.15.1 checksums | SHA-256 of the release tarball for `amd64` and `arm64`. |
| `listen_address` | string | `"127.0.0.1:9090"` | Address and port Prometheus serves its UI and API on. `":9090"` listens on every address. |
| `scrape_interval` | string | `"15s"` | How often Prometheus scrapes every target and evaluates rules, such as `"30s"` or `"1m"`. |
| `retention` | string | `"15d"` | How long Prometheus keeps samples, such as `"30d"` or `"26w"`. |
| `scrape_targets` | map(list(string)) | `{}` | Scrape jobs, by name, each a list of `HOST:PORT` targets, such as `{ node = ["10.0.0.5:9100"] }`. A job can't be named `prometheus`, which is Prometheus's own job. |
| `extra_args` | list(string) | `[]` | More Prometheus flags, such as `["--web.enable-admin-api"]`. |

## Outputs

| Name | Description |
| --- | --- |
| `config_file` | Path of the configuration file, `/etc/prometheus/prometheus.yml`. |
| `jobs` | Names of the scrape jobs, such as `["prometheus", "node"]`. |

## Requirements

Requires Conn3x v0.6.7 or later, systemd on each host, and outbound HTTPS to github.com.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-prometheus/tree/v0.1.0/examples/local) to each on amd64, checks that the second plan has no changes, and checks through the HTTP API that the `node` target is up and `up{job="node"}` is 1. It then changes the scrape interval, applies again, and checks that Prometheus picked it up without restarting. The same checks passed by hand in arm64 containers.

It was also applied by hand, with circuit-node-exporter, to an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing. On Rocky Linux, the default `127.0.0.1:9090` collided with `cockpit.socket` and the apply stopped at the ready check; with `listen_address = "127.0.0.1:9091"` both came up, scraped node_exporter, and reloaded in place on a scrape interval change. After a reboot Prometheus came back, the plan had no changes, and the audit log had no SELinux denials.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-prometheus/blob/v0.1.0/LICENSE). Prometheus itself is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-prometheus](https://github.com/conn3xorg/circuit-prometheus). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-prometheus/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-prometheus/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-prometheus/tree/v0.1.0/examples/local).
- Related circuits: [node_exporter](/circuits/node-exporter), [Grafana](/circuits/grafana), [Monitoring stack](/circuits/monitoring).
