---
title: InfluxDB 3 Core
description: "InfluxDB 3 Core from InfluxData's signed repo, on loopback, with your own admin token from the first start."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-influxdb at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/influxdb/grade.svg)](https://conn3x.org/circuits/influxdb/grade)

A Conn3x circuit that installs InfluxDB 3 Core from InfluxData's signed package repository and runs it under systemd, with an admin token you choose, on loopback until you say otherwise. Point Telegraf, Home Assistant or your own scripts at it and they write points over HTTP; you read them back with SQL.

The token comes in through an ephemeral variable, so it never lands in state or a plan.

## Why InfluxDB 3 Core

InfluxData's docs call InfluxDB 3 Core the current stable open source release, and mark the InfluxDB 2 pages as an earlier version. Flux, the query language InfluxDB 2 was built around, is in maintenance mode. A new self-hosted server today is a 3 Core server, so that's what this circuit installs.

Core is a different database from InfluxDB 2, not an upgrade of it. It speaks SQL and InfluxQL, keeps its data as Parquet files on local disk, and takes InfluxDB 1 and 2 style writes, but it doesn't run Flux, and it has no buckets, orgs or built-in web UI. If your dashboards are written in Flux, keep InfluxDB 2 for them.

## Usage

```hcl
module "influxdb" {
  source = "github.com/conn3xorg/circuit-influxdb?ref=v0.1.0"

  hosts                = { metrics = "192.168.1.30" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  admin_token = var.influxdb_admin_token
  http_bind   = "192.168.1.30:8181"
}

variable "influxdb_admin_token" {
  type      = string
  ephemeral = true
}
```

An admin token is `apiv3_` followed by at least 32 letters, digits, `_` or `-`. Make one, keep it in your password manager, and pass it at run time with `TF_VAR_influxdb_admin_token`:

```sh
export TF_VAR_influxdb_admin_token="apiv3_$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=')"
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

To check it works, write a point and read it back:

```sh
curl -H "Authorization: Bearer $TF_VAR_influxdb_admin_token" \
  'http://192.168.1.30:8181/api/v3/write_lp?db=home' --data-binary 'temp,room=office c=21.5'
curl -H "Authorization: Bearer $TF_VAR_influxdb_admin_token" \
  'http://192.168.1.30:8181/api/v3/query_sql?db=home&q=SELECT+*+FROM+temp'
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-influxdb/tree/v0.1.0/examples/local).

### The admin token, and set_admin_token

InfluxDB reads `/etc/influxdb3/admin-token.json` when it starts with no tokens at all, and keeps a hash of the token from then on. So the token you pass is the one the server starts with, and changing `admin_token` later doesn't change it: rotate it with `influxdb3 create token --admin --regenerate` on the host instead.

While `set_admin_token` is true, every plan needs `admin_token`, and the file stays on the host, readable by root and the `influxdb3` group. Once the server is up you can set `set_admin_token = false` and apply. Conn3x deletes the file, drops `admin-token-file` from the config and restarts InfluxDB, which keeps the token it already has. From then on, plans need no token.

To make the token yourself on the host instead, set `set_admin_token = false` from the start and run `influxdb3 create token --admin` once InfluxDB is up.

### Listening on the network

By default the API listens on `127.0.0.1:8181`, so only the host itself can reach it. Set `http_bind` to the host's own address to reach it from your network, or to `0.0.0.0:8181` for every address. The API is plain HTTP; put a reverse proxy with TLS in front of it, such as [circuit-caddy](/circuits/caddy), before it crosses a network you don't trust.

## What it does

Before the circuit runs, the `conn3x_host` data source reads each host's distribution over SSH. Then, on each host:

1. Installs `curl`, which the ready check uses.
2. Adds InfluxData's repository, `repos.influxdata.com/debian` on Debian and Ubuntu, `repos.influxdata.com/stable/$basearch/main` on the Red Hat family, with the signing key in [files](https://github.com/conn3xorg/circuit-influxdb/tree/v0.1.0/files).
3. Installs `influxdb3-core` at `influxdb_version`. The package brings the `influxdb3` user, a sandboxed systemd unit and the Python the processing engine runs plugins with.
4. With `set_admin_token`, writes `admin_token` to `/etc/influxdb3/admin-token.json`, mode `0640`, root and the `influxdb3` group.
5. Writes `/etc/influxdb3/influxdb3-core.conf` with `http_bind`, `node_id`, the telemetry setting and your `settings`. Data goes in `/var/lib/influxdb3/data` and plugins in `/var/lib/influxdb3/plugins`, the package's own paths. Before the new file replaces the old one, the apply reads it with the package's launcher, the same code that reads it when InfluxDB starts, so a file the launcher would refuse never goes live.
6. Restarts `influxdb3-core` when the config or `influxdb_version` changes, since InfluxDB can't reload its options. Keeps it enabled and running.
7. Waits up to a minute for the API to answer.

InfluxDB uploads usage telemetry to InfluxData by default. This circuit turns that off unless you set `telemetry = true`.

### Upgrades

Change `influxdb_version` and apply. Conn3x installs that release from the repository and restarts InfluxDB, which keeps its data and tokens. CI does this from 3.12.1 to 3.12.2 on every distribution and reads back a point written before the upgrade. Read InfluxData's release notes before a jump across minor versions.

The circuit doesn't hold the package, so a routine `apt upgrade` or `dnf upgrade` can move InfluxDB past `influxdb_version`. The next plan then shows the difference.

### The signing key

The key in `files/influxdata-archive.asc` is InfluxData's, fingerprint `24C9 75CB A61A 024E E1B6 3178 7C3D 5715 9FC2 F927`, downloaded from `repos.influxdata.com/influxdata-archive.key` and checked against the fingerprint in InfluxData's install docs. Its current signing subkey expires on 17 January 2029. When InfluxData rotates it, a new release of this circuit will carry the new key.

### What it doesn't do

- **No TLS.** InfluxDB 3 Core can serve TLS itself, but this circuit leaves it off. Use a reverse proxy.
- **No object storage.** Data stays on the host's disk. S3, Google Cloud Storage and Azure are Core options the circuit doesn't set up; `settings` can't set `object-store`, since the circuit owns it.
- **No backups.** Back up `/var/lib/influxdb3/data` with something like [circuit-restic](/circuits/restic).
- **One server per host.** High availability and read replicas are InfluxDB 3 Enterprise features.
- **It doesn't change the token** after the first start, for the reasons in [The admin token](#the-admin-token-and-set_admin_token).
- **It doesn't touch the host firewall.**
- Deleting the module leaves InfluxDB installed and running.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `influxdb_version` | string | `"3.12.2"` | InfluxDB 3 Core release to install. |
| `http_bind` | string | `"127.0.0.1:8181"` | Address and port the HTTP API listens on, such as `"192.168.1.30:8181"` or `"[::1]:8181"`. |
| `node_id` | string | `"primary-node"` | Node ID, the prefix on every path in the data directory. The package's default. Changing it on a server with data starts an empty one beside the old data. |
| `telemetry` | bool | `false` | Send InfluxData usage telemetry. |
| `set_admin_token` | bool | `true` | Give the server `admin_token` as its first admin token. |
| `admin_token` | string, sensitive, ephemeral | `null` | The admin token, `apiv3_` and at least 32 more characters. Ephemeral and sensitive. Required when `set_admin_token` is true. |
| `settings` | map(string) | `{}` | More server options, by their command-line name without the dashes, such as `{ gen1-duration = "10m" }`. The circuit's own options can't be set here. |

The `os` in a host object, one of `debian`, `ubuntu`, `rocky`, `almalinux`, `rhel` or `fedora`, stands in for the facts of a host created in the same plan.

`set_admin_token` is separate from `admin_token` because OpenTofu won't let a step's count depend on an ephemeral value.

## Outputs

| Name | Description |
| --- | --- |
| `url` | URL of the HTTP API, from `http_bind`. A wildcard address gives `127.0.0.1`. |
| `service` | The systemd unit InfluxDB runs as, `influxdb3-core.service`. |

## Requirements

Requires Conn3x v0.7.0 or later and systemd on each host, with outbound HTTPS to repos.influxdata.com. InfluxData builds packages for x86_64 and aarch64.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-influxdb/tree/v0.1.0/examples/local) to each on amd64, first at InfluxDB 3.12.1, then upgrades it to 3.12.2. After each apply it checks that the second plan has no changes. It writes a point with the admin token and queries it back over SQL, checks a request without the token is refused, reads the point again after the upgrade and after restarting the host, and checks the token stayed out of state. The CI containers run with SELinux off. The same steps also passed by hand on Ubuntu 24.04 and Rocky Linux 10 droplets, the Rocky one with SELinux enforcing and no denials in the audit log, including a reboot followed by a clean plan. Switching `set_admin_token` to false there deleted the token file, and the token kept working.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-influxdb/blob/v0.1.0/LICENSE). InfluxDB 3 Core is MIT or Apache-2.0, at your choice.

## Source

- Repository: [conn3xorg/circuit-influxdb](https://github.com/conn3xorg/circuit-influxdb). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-influxdb/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-influxdb/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-influxdb/tree/v0.1.0/examples/local).
- Related circuits: [Caddy](/circuits/caddy), [restic](/circuits/restic), [PostgreSQL](/circuits/postgres), [MariaDB](/circuits/mariadb), [MySQL](/circuits/mysql), [SQL Server](/circuits/mssql), [CouchDB](/circuits/couchdb), [Valkey](/circuits/valkey), [OpenSearch](/circuits/opensearch), [SQLite](/circuits/sqlite), [Cassandra](/circuits/cassandra), [Oracle AI Database Free](/circuits/oracle-free).
