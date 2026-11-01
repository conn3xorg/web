---
title: SQLite
description: "The sqlite3 command line tool from your distribution's packages, with optional empty databases created with an owner and mode."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-sqlite at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/sqlite/grade.svg)](https://conn3x.org/circuits/sqlite/grade)

A Conn3x circuit that installs the `sqlite3` command from each distribution's packages, and can create empty databases with the owner and mode you want, ready for your application to open.

Be clear on one thing before you use it. **The SQLite version differs per distribution**, because the distributions ship it and this circuit takes what they ship:

| Distribution | SQLite, checked October 2026 |
| --- | --- |
| Ubuntu 24.04 | 3.45.1 |
| Debian 13 | 3.46.1 |
| Rocky Linux 10 | 3.46.1 |
| Fedora 45 | 3.53.4 |

The file format hasn't changed across these, so a database moves between them. A newer SQL feature might not.

## Usage

```hcl
module "sqlite" {
  source = "github.com/conn3xorg/circuit-sqlite?ref=v0.1.0"

  hosts                = { app1 = "203.0.113.10", app2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  databases = {
    "/var/lib/app/app.db" = { owner = "app", mode = "0640" }
  }
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry:

```hcl
hosts = {
  for name, d in digitalocean_droplet.app : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-sqlite/tree/v0.1.0/examples/local).

### Databases

A database that's already there keeps its contents, every time: the circuit only ever sets its owner and mode. SQLite writes a journal beside the database, so the owner needs to be able to write to the directory too. When the directory doesn't exist, the circuit creates it for the owner, with mode `0750`. When it does, it's left alone, so you can't take over `/var/lib` by accident, and write access to it is yours to arrange.

The owner has to exist already. Create the user with your own step or circuit first.

## What it does

On each host, in order:

1. Installs `sqlite3` on Debian and Ubuntu, or `sqlite` on the Red Hat family.
2. For each of `databases`, creates its directory if it's missing, creates the database if it's missing or empty, and sets its owner and mode, unless they're already right.

Before the circuit runs, the `conn3x_host` data source reads each host's distribution over SSH, which picks the package.

### What it doesn't do

- It doesn't create tables or run SQL. The schema belongs to your application.
- It doesn't back anything up.
- It doesn't pin SQLite. Updates arrive with the host's other package updates.
- It doesn't uninstall anything. A database you take out of `databases`, and everything else when you delete the module, stays on the host. It never deletes a database.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `databases` | map(object) | `{}` | Empty databases to create, by absolute path. Each object takes `owner` (default `"root"`), `group` (default the owner's name) and `mode` (default `"0640"`). |

## Outputs

| Name | Description |
| --- | --- |
| `sqlite3` | Path of the `sqlite3` command on each host, by host name: `/usr/bin/sqlite3`. |

## Requirements

Requires Conn3x v0.6.10 or later, and a package mirror each host can reach. amd64 and arm64.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. [examples/local](https://github.com/conn3xorg/circuit-sqlite/tree/v0.1.0/examples/local) was applied to each on arm64, and the second plan had no changes. The database's owner then created a table and wrote to it, root read the row back, the owner and mode hadn't moved, and one more plan had no changes. CI runs the same check on amd64.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, amd64, each shared with the other circuits of this batch: the same check passed, and after a reboot the plan had no changes and the data was still there.

`ssh_become` wasn't exercised: every test logged in as root.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-sqlite/blob/v0.1.0/LICENSE). SQLite is in the public domain.

## Source

- Repository: [conn3xorg/circuit-sqlite](https://github.com/conn3xorg/circuit-sqlite). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-sqlite/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-sqlite/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-sqlite/tree/v0.1.0/examples/local).
- Related circuits: [PostgreSQL](/circuits/postgres), [MariaDB](/circuits/mariadb), [MySQL](/circuits/mysql), [SQL Server](/circuits/mssql), [CouchDB](/circuits/couchdb), [Valkey](/circuits/valkey), [OpenSearch](/circuits/opensearch).
