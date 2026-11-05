---
title: Oracle AI Database Free
description: "Oracle AI Database Free on Rocky Linux, from Oracle's RPM, under its own systemd unit, with the licence accepted up front."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-oracle-free at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/oracle-free/grade.svg)](https://conn3x.org/circuits/oracle-free/grade)

A Conn3x circuit that installs Oracle AI Database Free on Rocky Linux and creates its database, the way Oracle's own RPM install does it, without anyone typing a password into the configure script. You get the `FREE` container database, its `FREEPDB1` pluggable database and a listener on port 1521, started at boot.

Oracle AI Database Free is free to use, under Oracle's licence rather than an open-source one, so the circuit asks you to accept it first. Until `accept_oracle_license` is `true`, the plan stops before it touches a host.

It's Database Free only. Oracle limits it to two CPU cores, 2 GB of memory and 12 GB of user data, whatever the host has. Other editions need a licence agreement with Oracle, and this circuit doesn't install them.

## Usage

```hcl
variable "oracle_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "oracle_free" {
  source = "github.com/conn3xorg/circuit-oracle-free?ref=v0.1.0"

  hosts                = { db = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  # Read https://www.oracle.com/downloads/licenses/oracle-free-license.html
  # first: this accepts it.
  accept_oracle_license = true
  admin_password        = var.oracle_password
}
```

Then run `conn3x init` and `conn3x apply` with the password in the environment:

```sh
export TF_VAR_oracle_password='...'
conn3x apply
```

The first apply downloads about 1.5 GB from Oracle and takes a few minutes to create the database. A second `conn3x plan` says `No changes.` Every plan needs the password too, since Conn3x checks the file on the host against it.

Connect from the host with the `connect_strings` output, such as `sqlplus system@//127.0.0.1:1521/FREEPDB1`, with `sqlplus` from the `oracle_home` output's `bin`.

The circuit reads each host's release and architecture before it plans, so the hosts must exist already. To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-oracle-free/tree/v0.1.0/examples/local).

## What it does

On each host, in order:

1. Installs `curl` for the downloads, `iproute` to find the host's address, and `hostname`, which Oracle's configure script uses.
2. Makes sure the host's name resolves to an address other than loopback. Oracle's listener setup refuses a name that only resolves to `127.0.0.1`, which is what cloud images such as DigitalOcean's write in `/etc/hosts`. Where that's so, the circuit adds a line mapping the name to the source address of the default route, in `/etc/hosts` and in cloud-init's `/etc/cloud/templates/hosts.redhat.tmpl`, which `/etc/hosts` is written from at boot.
3. Downloads Oracle's preinstall package, `oracle-ai-database-preinstall-26ai`, from yum.oracle.com, checks its SHA-256 against the one on Oracle's download page and installs it with `dnf`, which brings in what the database needs from Rocky Linux's own repositories. The package creates the `oracle` user and its groups, and sets the kernel settings and limits Oracle asks for.
4. Downloads the database RPM, `oracle-ai-database-free-26ai`, from download.oracle.com, checks its SHA-256 against `oracle_free_sha256`, installs it and deletes it, so the 1.5 GB file doesn't stay on disk. The Oracle home lands in `/opt/oracle/product/26ai/dbhomeFree`.
5. Writes the password to `/etc/conn3x/oracle-free/password` (root only, mode 0600), and sets `LISTENER_PORT=1521` in `/etc/sysconfig/oracle-free-26ai.conf`. Left empty, configure would take the next free port when 1521 is busy; set, it stops instead.
6. Runs `/etc/init.d/oracle-free-26ai configure` once, with the password on its standard input. It creates the database in `/opt/oracle/oradata` and sets the same password for `SYS`, `SYSTEM` and `PDBADMIN`.
7. Writes a systemd unit, `oracle-free-26ai.service`, that starts and stops the database through Oracle's script, and keeps it enabled at boot. The RPM ships only the SysV script.
8. Logs in to `FREEPDB1` as `SYSTEM` over the listener. If that fails, such as after a change to `admin_password`, it sets the password for all three accounts through the `oracle` user's own login, which needs none, and logs in again. The password reaches `sqlplus` on standard input, so it never shows in `ps`, and only goes to a listener port held by the `oracle` user.

### Which builds Oracle makes

Oracle builds Database Free for these, and the circuit stops at the plan on any other host:

| | x86_64 | aarch64 |
| --- | --- | --- |
| Rocky Linux 9 | Yes | Yes |
| Rocky Linux 10 | Yes | No |

### What it doesn't cover

- **Other editions.** Database Free only.
- **Other distributions.** Oracle's RPM targets Oracle Linux and RHEL. Rocky Linux runs it unchanged, and it's the only one this circuit installs on.
- **Upgrades.** Only 23.26.3-1 has been tested. Setting `oracle_free_version` to a newer release makes the circuit install that RPM with `dnf`, but it doesn't patch the database with datapatch; Oracle's guide covers that.
- **Users, schemas and other settings.** The circuit manages the three administrative passwords and nothing else in the database. The character set and data file location stay at the defaults in `/etc/sysconfig/oracle-free-26ai.conf`, AL32UTF8 and `/opt/oracle/oradata`, and the listener is on 1521.
- **Firewall.** The circuit opens no ports. The listener takes connections on every address on 1521, and the [firewall circuit](/circuits/firewall) can open or close it.
- **Removal.** Taking the module out leaves Oracle installed and the database in place. `/etc/init.d/oracle-free-26ai delete` removes the database, and `dnf remove oracle-ai-database-free-26ai` the software.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Rocky Linux hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `accept_oracle_license` | bool | Required | `true` accepts the [Oracle Free Use Terms and Conditions](https://www.oracle.com/downloads/licenses/oracle-free-license.html). Anything else fails the plan. |
| `admin_password` | string, ephemeral, sensitive | Required | Password for `SYS`, `SYSTEM` and `PDBADMIN`. 8 to 30 characters: letters, digits, `_` and `#`, starting with a letter, with an uppercase letter, a lowercase letter and a digit. Oracle's configure script refuses most other punctuation. |
| `oracle_free_version` | string | `"23.26.3-1"` | Release of the `oracle-ai-database-free-26ai` RPM. Change `oracle_free_sha256` with it. |
| `oracle_free_sha256` | map(string) | The SHA-256s of 23.26.3-1 | SHA-256 of each build of the RPM, keyed `el9.x86_64`, `el9.aarch64` and `el10.x86_64`, from Oracle's download page. |

## Outputs

| Name | Description |
| --- | --- |
| `connect_strings` | Easy Connect strings for the container database and `FREEPDB1` on each host, from the host itself, such as `{ db = { cdb = "//127.0.0.1:1521/FREE", pdb = "//127.0.0.1:1521/FREEPDB1" } }`. |
| `oracle_home` | `/opt/oracle/product/26ai/dbhomeFree`, which holds `sqlplus` and `lsnrctl` in `bin`. |

## Requirements

Requires Conn3x v0.7.0 or later, Rocky Linux 9 or 10 with systemd, outbound HTTPS to download.oracle.com, yum.oracle.com and Rocky Linux's mirrors, at least 1 GB of free memory when the database is created, and about 10 GB of disk.

## Tested on

Rocky Linux 9 and 10, with Oracle AI Database Free 23.26.3. CI applies [examples/local](https://github.com/conn3xorg/circuit-oracle-free/tree/v0.1.0/examples/local) to a Rocky Linux 10 container and a Rocky Linux 9 one on amd64, checks that the second plan has no changes and that the password isn't in the state, logs in to `FREEPDB1` as `SYSTEM` over the listener, writes a row and reads it back, checks a wrong password is refused, restarts the host, reads the row again and plans again with no changes. CI also checks that a plan with `accept_oracle_license = false` stops with the licence message. The same checks passed by hand in an arm64 Rocky Linux 9 container, along with a change to `admin_password`, after which `SYS`, `SYSTEM` and `PDBADMIN` all logged in with the new one.

On a Rocky Linux 9 droplet and a Rocky Linux 10 droplet, each with 2 vCPUs, 4 GB of memory and SELinux enforcing, the apply passed, the second plan had no changes, a row written as `SYSTEM` read back and a wrong password was refused. Both came back after a reboot with the database open and the row there, the plan had no changes, and the audit log had no denials. The database took about 8 GB of disk.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-oracle-free/blob/v0.1.0/LICENSE). Oracle AI Database Free itself is under the [Oracle Free Use Terms and Conditions](https://www.oracle.com/downloads/licenses/oracle-free-license.html), and this circuit doesn't include any of it: each host downloads it from Oracle.

## Source

- Repository: [conn3xorg/circuit-oracle-free](https://github.com/conn3xorg/circuit-oracle-free). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-oracle-free/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-oracle-free/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-oracle-free/tree/v0.1.0/examples/local).
- Related circuits: [Firewall](/circuits/firewall), [PostgreSQL](/circuits/postgres), [MariaDB](/circuits/mariadb), [MySQL](/circuits/mysql), [SQL Server](/circuits/mssql), [CouchDB](/circuits/couchdb), [Valkey](/circuits/valkey), [OpenSearch](/circuits/opensearch), [SQLite](/circuits/sqlite), [Cassandra](/circuits/cassandra), [InfluxDB 3 Core](/circuits/influxdb).
