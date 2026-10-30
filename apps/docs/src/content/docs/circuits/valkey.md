---
title: Valkey
description: "Valkey, the open Redis fork, from your distribution with a write-only password, memory limits and RDB or AOF persistence."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-valkey at v0.1.0. -->

A Conn3x circuit that installs Valkey, the open-source fork of Redis, and sets it up as a password-protected cache or key-value store. You choose where it listens, how much memory it gets, what it evicts when that runs out, and whether data survives a restart. The password goes in at run time and never lands in state.

It also sets `vm.overcommit_memory = 1`, which Valkey asks for in its log on every start until you do. Without it, the fork behind a background save can fail on a busy host, and with persistence on that means writes start failing too.

## Usage

```hcl
variable "valkey_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "valkey" {
  source = "github.com/conn3xorg/circuit-valkey?ref=v0.1.0"

  hosts                = { cache = "192.168.1.40" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  password         = var.valkey_password
  bind             = ["127.0.0.1", "192.168.1.40"]
  maxmemory        = "512mb"
  maxmemory_policy = "allkeys-lru"
}
```

Then run `conn3x init` and `conn3x apply` with the password in the environment:

```sh
export TF_VAR_valkey_password='...'
conn3x apply
```

A second `conn3x plan` says `No changes.` Every plan needs the password too, since Conn3x checks the file on the host against it.

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry. Give each one's distribution in `os` too: the circuit picks its package and unit by distribution, and Conn3x can't ask a host that doesn't exist yet. If `os` turns out not to match the host, Conn3x stops before configuring it. Set `os` as well when you put `depends_on` on this module: `depends_on` holds back reading the hosts until the apply, so without `os` the plan fails with `Invalid for_each argument`.

```hcl
hosts = {
  for name, d in digitalocean_droplet.cache : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
    os       = "ubuntu"
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-valkey/tree/v0.1.0/examples/local).

## Where Valkey comes from

Each distribution's own package. All four ship one, so there's no third-party repository to trust and security fixes arrive with the rest of your updates. The catch is that you get the distribution's version, not upstream's latest:

| Distribution | Package | Version when tested | Repository |
| --- | --- | --- | --- |
| Ubuntu 24.04 | `valkey-server` | 7.2.13 | universe, `noble-updates` |
| Debian 13 | `valkey-server` | 8.1.1 | main |
| Rocky Linux 10 | `valkey` | 8.0.11 | AppStream |
| Fedora 45 | `valkey` | 9.1.2 | fedora |

Upstream was at 9.1.3. Everything this circuit sets works the same from 7.2 on, so the spread doesn't change what you configure. It matters if your app needs a newer command, such as per-field expiry on hashes, which arrived in 9.0 and so is only on Fedora for now.

Upstream publishes no packages, only binary tarballs built on Ubuntu. Using those everywhere would pin one version, but the circuit would have to supply the user, the systemd unit and the SELinux labelling the packages already get right, and you'd be the one watching for security releases. That's why there's no version input.

## What it does

On each host, in order:

1. On the Red Hat family, when `port` isn't 6379, installs `policycoreutils-python-utils` and labels the port `redis_port_t` with `semanage`, so SELinux lets Valkey bind it. Hosts with SELinux off skip the label.
2. Installs `valkey-server` on Debian and Ubuntu, or `valkey` on the Red Hat family.
3. Sets `vm.overcommit_memory = 1`, now and at boot, through `/etc/sysctl.d/90-conn3x-vm.overcommit_memory.conf`.
4. Writes `/etc/valkey/conn3x.conf` with `bind`, `port`, `maxmemory`, `maxmemory-policy`, `dir` and the persistence settings, and `/etc/valkey/conn3x-auth.conf` with `requirepass`. Both are mode 0640, owned the way the package owns `valkey.conf`.
5. Adds `include /etc/valkey/conn3x.conf` as the last line of `/etc/valkey/valkey.conf`. Valkey reads an include where it appears and a later setting wins, so yours override the distribution's and the rest of its file still applies.
6. Restarts Valkey when any of those three files changed, then keeps it running and enabled at boot. Valkey has no reload, and `bind`, `port` and the password only change on a restart.

If someone edits `conn3x.conf` by hand, the next plan shows the difference and the apply puts yours back and restarts Valkey.

### Persistence

With `rdb` on, the default, Valkey saves a snapshot to `/var/lib/valkey/dump.rdb` on its usual schedule (after an hour with one change, five minutes with 100, or a minute with 10,000) and when it shuts down cleanly, then loads it on start. A restart or reboot keeps your data; a crash loses what changed since the last snapshot.

`aof` adds the append-only file, fsynced once a second, so a crash loses at most about a second of writes. Turn both off for a pure cache that starts empty.

### Distribution differences

| | Debian, Ubuntu | Rocky Linux, AlmaLinux, RHEL, Fedora |
| --- | --- | --- |
| systemd unit | `valkey-server` | `valkey` |
| Owner of the files in `/etc/valkey` | `valkey:valkey` | `valkey:root` |

The `services` output gives the unit per host. On the Red Hat family a tmpfiles rule in the package resets `/etc/valkey` to `valkey:root` at boot, which is why the circuit uses that owner there; anything else showed up as drift after a reboot.

### What it doesn't cover

- **ACL users.** There's one password, for the `default` user. Add named users with `ACL SETUSER` or an ACL file yourself.
- **TLS, replication, Sentinel and cluster mode.** None of these are set up.
- **Firewall.** The circuit doesn't open the port. The [firewall circuit](/circuits/firewall) can. Valkey speaks plain text, so keep it off the internet even with a password.
- **Removal.** Deleting the module leaves Valkey installed and running with the last settings.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`, the distribution's ID, such as `ubuntu` or `rocky`, which a host created in the same plan needs. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `password` | string, ephemeral, sensitive | Required | Password every client gives with `AUTH`, set as `requirepass`. Any characters but line breaks. |
| `bind` | list(string) | `["127.0.0.1", "-::1"]` | Addresses to listen on, such as `["0.0.0.0"]`. A leading `-` lets Valkey start when that address is missing, which the default uses for IPv6 loopback. |
| `port` | number | `6379` | TCP port. |
| `maxmemory` | string | `"0"` | Memory for data before `maxmemory_policy` applies, such as `"512mb"` or `"2gb"`. `"0"` means no limit. |
| `maxmemory_policy` | string | `"noeviction"` | What happens at `maxmemory`. `noeviction` refuses writes; `allkeys-lru`, `allkeys-lfu`, `allkeys-random`, `volatile-lru`, `volatile-lfu`, `volatile-random` and `volatile-ttl` evict keys, which is what a cache wants. |
| `rdb` | bool | `true` | Save RDB snapshots, so data survives a restart. |
| `aof` | bool | `false` | Keep the append-only file as well, fsynced every second. |

## Outputs

| Name | Description |
| --- | --- |
| `config_file` | Path of the settings file, `/etc/valkey/conn3x.conf`. |
| `services` | systemd unit running Valkey on each host, such as `{ cache = "valkey-server" }`. |

## Requirements

Requires Conn3x v0.6.5 or later and systemd on each host, with a package mirror the host can reach. Setting `vm.overcommit_memory` needs a host that owns its kernel settings: a VM or bare metal, or a privileged container.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-valkey/tree/v0.1.0/examples/local) to each on amd64, checks that the second plan has no changes, then uses `valkey-cli` to `SET` and `GET` a key with the password, checks a command without it gets `NOAUTH`, checks the example's eviction policy and append-only file are on, restarts Valkey and reads the key back. The same ran by hand on arm64 containers, along with a password containing a space, a double quote and a backslash, and a move to port 6380 with persistence off and a new password, after which the second plan was clean.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, the same checks passed by hand, the Rocky one on port 6380. There the circuit labelled 6380 `redis_port_t`, Valkey ran confined as `redis_t`, and the audit log had no denials. Both came back after a reboot with Valkey running, the key still there and the second plan clean.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-valkey/blob/v0.1.0/LICENSE). Valkey itself is BSD-3-Clause.

## Source

- Repository: [conn3xorg/circuit-valkey](https://github.com/conn3xorg/circuit-valkey). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-valkey/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-valkey/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-valkey/tree/v0.1.0/examples/local).
- Related circuits: [Firewall](/circuits/firewall), [PostgreSQL](/circuits/postgres), [MariaDB](/circuits/mariadb), [MySQL](/circuits/mysql), [CouchDB](/circuits/couchdb), [OpenSearch](/circuits/opensearch).
