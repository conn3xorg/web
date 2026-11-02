---
title: node_exporter
description: "Runs Prometheus node_exporter at a pinned, checksummed version as its own system user."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-node-exporter at v0.1.1. -->

[![Conn3x grade](https://conn3x.org/circuits/node-exporter/grade.svg)](https://conn3x.org/circuits/node-exporter/grade)

A Conn3x circuit that installs the Prometheus [node_exporter](https://github.com/prometheus/node_exporter) on your hosts and keeps it running. It downloads a pinned release, checks its SHA-256 before using it, and runs it as its own `node_exporter` user under systemd. x86_64 and arm64 hosts each get the right build.

## Usage

```hcl
module "node_exporter" {
  source = "github.com/conn3xorg/circuit-node-exporter?ref=v0.1.1"

  hosts = {
    web1 = "203.0.113.10"
    web2 = "203.0.113.11"
  }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}

output "scrape_targets" {
  value = module.node_exporter.metrics_urls
}
```

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry:

```hcl
module "node_exporter" {
  source = "github.com/conn3xorg/circuit-node-exporter?ref=v0.1.1"

  hosts = {
    for name, d in digitalocean_droplet.app : name => {
      address  = d.ipv4_address
      host_key = tls_private_key.host[name].public_key_openssh
    }
  }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-node-exporter/tree/v0.1.1/examples/local).

## What it does

On each host, in order:

1. Installs `curl`, `tar` and `gzip` if they're missing.
2. Creates the `node_exporter` system user, with home `/var/lib/node_exporter` and no login shell.
3. Downloads `node_exporter-VERSION.linux-ARCH.tar.gz` from the GitHub release into `/opt/node_exporter`. If the checksum doesn't match `checksums`, the apply fails and nothing is unpacked.
4. Unpacks it to `/opt/node_exporter/node_exporter-VERSION.linux-ARCH/`.
5. Writes `/etc/systemd/system/node_exporter.service`, and restarts the service when the file changes.
6. Starts node_exporter now and at boot.

Before the circuit runs, the `conn3x_host` data source reads each host's architecture over SSH. `x86_64` maps to `amd64` and `aarch64` to `arm64`; other architectures fail the plan.

The circuit doesn't open a firewall port. Open `listen_port` to your Prometheus server with a `firewalld` or `ufw` step of your own.

### Upgrading

Set `node_exporter_version` and `checksums` together. Take both checksums from the release's `sha256sums.txt`:

```hcl
module "node_exporter" {
  source = "github.com/conn3xorg/circuit-node-exporter?ref=v0.1.1"

  hosts                 = { web1 = "203.0.113.10" }
  node_exporter_version = "1.12.1"
  checksums = {
    amd64 = "b51d8a76aa2a9156a55d501aca6276fae09e262259a5e4e831d2c2222f084e63"
    arm64 = "ad35b605f9954b9f1ffddf5ba054bdc5a98d790b9eae5291e1eeb83f1ecbd0e7"
  }
}
```

The new release unpacks beside the old one, the unit file points at it, and the handler restarts the service. The old directory stays until you remove it.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `node_exporter_version` | string | `"1.12.1"` | node_exporter release to install, without the leading `v`. |
| `checksums` | map(string) | The 1.12.1 checksums | SHA-256 of the release tarball for `amd64` and `arm64`. |
| `listen_port` | number | `9100` | Port node_exporter listens on, on every address. |
| `extra_args` | list(string) | `[]` | More node_exporter flags, such as `["--collector.systemd"]`. |

## Outputs

| Name | Description |
| --- | --- |
| `metrics_urls` | Each host's metrics URL by host name, such as `{ web1 = "http://203.0.113.10:9100/metrics" }`. |

## Requirements

Requires Conn3x v0.6.4 or later, systemd on each host, and outbound HTTPS to github.com.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-node-exporter/tree/v0.1.1/examples/local) to each on amd64, checks that the second plan has no changes, and scrapes the metrics from outside the host, before and after a restart.

It was also applied by hand, with six other circuits, to an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing. On both, node_exporter ran under systemd, served metrics on port 9100, and circuit-monitoring's Prometheus scraped it through the Docker bridge. After a reboot it came back, the plan had no changes and the audit log had no SELinux denials. The same checks passed on Fedora 44, with SELinux enforcing, and Debian 13 droplets, before and after a reboot.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-node-exporter/blob/v0.1.1/LICENSE). node_exporter itself is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-node-exporter](https://github.com/conn3xorg/circuit-node-exporter). This page covers [v0.1.1](https://github.com/conn3xorg/circuit-node-exporter/tree/v0.1.1); the repository's [tags](https://github.com/conn3xorg/circuit-node-exporter/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-node-exporter/tree/v0.1.1/examples/local).
- Related circuits: [Prometheus](/circuits/prometheus), [Grafana](/circuits/grafana), [Monitoring stack](/circuits/monitoring), [Netdata](/circuits/netdata), [OpenTelemetry Collector](/circuits/otelcol), [Zabbix](/circuits/zabbix), [Nagios Core](/circuits/nagios).
