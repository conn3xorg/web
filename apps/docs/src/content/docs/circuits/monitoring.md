---
title: Monitoring stack
description: "Prometheus, Grafana and cAdvisor as one Compose stack, scraping the targets you give it."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-monitoring at v0.2.0. -->

A Conn3x circuit that runs Prometheus, Grafana and cAdvisor on a host with Docker, as one Compose stack. Prometheus scrapes the targets you give it, Grafana comes up with Prometheus already set as its data source, and cAdvisor reports on every container on the host.

Pair it with [circuit-docker](/circuits/docker) to get Docker on the host, and [circuit-node-exporter](/circuits/node-exporter) for the machines you want to watch. One configuration, one `conn3x apply`, and the dashboards are up.

## Usage

```hcl
module "docker" {
  source = "github.com/conn3xorg/circuit-docker?ref=v0.1.1"

  hosts = { monitor = "192.168.1.10" }
}

module "node_exporter" {
  source = "github.com/conn3xorg/circuit-node-exporter?ref=v0.1.0"

  hosts = {
    nas    = "192.168.1.20"
    media  = "192.168.1.21"
    router = "192.168.1.1"
  }
}

module "monitoring" {
  source = "github.com/conn3xorg/circuit-monitoring?ref=v0.2.0"

  hosts                  = { monitor = "192.168.1.10" }
  grafana_admin_password = var.grafana_admin_password
  targets = {
    node = [for url in values(module.node_exporter.metrics_urls) : regex("//([^/]+)/", url)[0]]
  }

  depends_on = [module.docker]
}

variable "grafana_admin_password" {
  type      = string
  ephemeral = true
}

output "grafana" {
  value = module.monitoring.grafana_urls
}
```

Pass the password at run time, with `-var grafana_admin_password=...` or `TF_VAR_grafana_admin_password`. It is ephemeral, so it never goes into state or a plan. On the host it lives in `/opt/stacks/monitoring/grafana_admin_password`, mode `0640`.

Then run `conn3x init` and `conn3x apply`, and sign in to Grafana as `admin`. A second `conn3x plan` says `No changes.` For host metrics, import the [Node Exporter Full](https://grafana.com/grafana/dashboards/1860) dashboard, ID 1860.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-monitoring/tree/v0.2.0/examples/local).

## What it does

On each host, in order:

1. Creates `/opt/stacks/monitoring`.
2. Writes the Grafana admin password there, as a write-only file Grafana's group can read.
3. Writes `compose.yaml`, with the Prometheus configuration and Grafana's data source inline, as Compose `configs`.
4. Runs `docker compose up -d --remove-orphans --wait` when the file changed since the last run, or when one of its services isn't running.

The stack has:

- **Prometheus**, published on `prometheus_listen` port `prometheus_port`, which is `127.0.0.1:9090` by default because Prometheus has no login. It scrapes itself, cAdvisor and `targets`, and keeps samples for `retention`.
- **Grafana**, published on `grafana_listen` port 3000, with sign-up turned off.
- **cAdvisor**, which isn't published at all. Prometheus reaches it over the stack's own network. Set `cadvisor = false` to leave it out.

Rocky Linux, AlmaLinux and RHEL cloud images often turn on Cockpit, whose `cockpit.socket` holds port 9090, so Prometheus can't start there and the apply fails with `address already in use`. Set `prometheus_port` to another port, such as 9091, or turn Cockpit off with `systemctl disable --now cockpit.socket`.

Prometheus and Grafana keep their data in the `monitoring_prometheus` and `monitoring_grafana` Docker volumes, which outlive the containers.

A change to `targets`, `scrape_interval` or `retention` rewrites the Compose file, and Compose recreates the containers it affects. Grafana reads `grafana_admin_password` only on its first start, so later changes to it do nothing. Change the password in Grafana instead.

Targets are scraped from inside a container. To reach a node_exporter on the Docker host itself, use the bridge's address, `172.17.0.1:9100`.

The circuit doesn't open firewall ports. Open port 3000 to the people who use Grafana, and each target's port to the Prometheus host.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to run the stack on, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. |
| `grafana_admin_password` | string, ephemeral | Required | Password for Grafana's `admin` user, read on Grafana's first start. |
| `targets` | map(list(string)) | `{}` | Scrape targets by job name, as `host:port`, such as `{ node = ["10.0.0.11:9100"] }`. `prometheus` and `cadvisor` are taken. |
| `scrape_interval` | string | `"30s"` | How often Prometheus scrapes each target. |
| `retention` | string | `"15d"` | How long Prometheus keeps samples. |
| `prometheus_listen` | string | `"127.0.0.1"` | Address Prometheus's port is published on. |
| `prometheus_port` | number | `9090` | Host port Prometheus is published on. |
| `grafana_listen` | string | `"0.0.0.0"` | Address Grafana's port 3000 is published on. |
| `cadvisor` | bool | `true` | Run cAdvisor too. |
| `prometheus_version` | string | `"v3.15.0"` | Tag of the `prom/prometheus` image. |
| `grafana_version` | string | `"13.2.4"` | Tag of the `grafana/grafana` image. |
| `cadvisor_version` | string | `"v0.60.6"` | Tag of the `ghcr.io/google/cadvisor` image. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |

## Outputs

| Name | Description |
| --- | --- |
| `grafana_urls` | Each host's Grafana URL by host name, such as `{ monitor = "http://192.168.1.10:3000" }`. |

## Requirements

Requires Conn3x v0.6.4 or later, and Docker Engine with the Compose plugin v2.23 or later on each host, which [circuit-docker](/circuits/docker) installs.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-monitoring/tree/v0.2.0/examples/local), which installs Docker and node_exporter too, to each on amd64, checks that the second plan has no changes, and checks that all three services are running.

It was also applied by hand, with circuit-docker, circuit-node-exporter, circuit-firewall and three other circuits, to an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing. That run found two problems, both fixed: Cockpit held port 9090 on Rocky Linux, hence `prometheus_port`, and a changed compose file only came up on the second apply. On both hosts Prometheus reported its own target, cAdvisor and node_exporter on the Docker bridge as up, Grafana answered on port 3000, moving Prometheus to another port took effect in a single apply, and after a reboot the stack came back with no plan changes and no SELinux denials. The same checks passed on Fedora 44, with SELinux enforcing, and Debian 13 droplets, before and after a reboot.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-monitoring/blob/v0.2.0/LICENSE). Prometheus, Grafana and cAdvisor carry their own licenses: Apache-2.0, AGPL-3.0 and Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-monitoring](https://github.com/conn3xorg/circuit-monitoring). This page covers [v0.2.0](https://github.com/conn3xorg/circuit-monitoring/tree/v0.2.0); the repository's [tags](https://github.com/conn3xorg/circuit-monitoring/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-monitoring/tree/v0.2.0/examples/local).
- Related circuits: [Docker](/circuits/docker), [node_exporter](/circuits/node-exporter), [Prometheus](/circuits/prometheus), [Grafana](/circuits/grafana).
