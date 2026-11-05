---
title: NetBird
description: "Installs the NetBird client from NetBird's signed repository and joins your hosts to your NetBird network, cloud or self-hosted, with the setup key kept out of state."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-netbird at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/netbird/grade.svg)](https://conn3x.org/circuits/netbird/grade)

A Conn3x circuit that installs the [NetBird](https://netbird.io) client from NetBird's own package repository, keeps it running, and joins your hosts to your NetBird network with a setup key. It works the same against NetBird's cloud and against a management server you host yourself: point `management_url` at yours.

The setup key comes in through an ephemeral variable, so it never lands in state or a plan.

## Usage

```hcl
module "netbird" {
  source = "github.com/conn3xorg/circuit-netbird?ref=v0.1.0"

  hosts                = { nas = "192.168.1.20", vps = "203.0.113.10" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  management_url = "https://netbird.example.com:443"
  setup_key      = var.netbird_setup_key
}

variable "netbird_setup_key" {
  type      = string
  ephemeral = true
}
```

Make a setup key in the NetBird dashboard under **Setup Keys**, and pass it at run time with `TF_VAR_netbird_setup_key` or `-var netbird_setup_key=...`. A reusable key suits several hosts. Leave out `management_url` to join NetBird's cloud.

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

### Join once, then set join = false

While `join` is true, every plan needs `setup_key`, and setup keys expire. Once the hosts have joined:

1. Set `join = false` and apply. Conn3x deletes `/etc/netbird/setup-key` from each host and drops the join steps from state. The hosts stay in the network: removing the step doesn't run anything on them.
2. From then on, plan and apply without a key.

To add a host later, set `join = true` with a key for that apply, then back to false. Hosts that are already logged in skip `netbird up`.

To install NetBird and leave the hosts logged out, set `join = false` from the start and leave out `setup_key`.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-netbird/tree/v0.1.0/examples/local).

## What it does

Before the circuit runs, the `conn3x_host` data source reads each host's distribution over SSH. Then, on each host:

1. Adds NetBird's repository, `pkgs.netbird.io/debian` on Debian and Ubuntu and `pkgs.netbird.io/yum` on the Red Hat family, with the signing key for each from [files](https://github.com/conn3xorg/circuit-netbird/tree/v0.1.0/files).
2. Installs `netbird` at `netbird_version`. The package installs `netbird.service` and starts it. The circuit keeps it enabled and running.
3. When `join` is true, writes `setup_key` to `/etc/netbird/setup-key`, mode `0600`, and runs `netbird up --setup-key-file /etc/netbird/setup-key --management-url ...` with `hostname` and `extra_args`. It skips this when `netbird status` already reports the client as connected or connecting, so a host that has joined isn't logged in again.

### Upgrades

Change `netbird_version` and apply. The package restarts the client, which reconnects with the identity it already holds. CI does this from 0.81.5 to 0.82.0 and pings the host across the network afterwards.

The circuit doesn't hold the package, so a routine `apt upgrade` or `dnf upgrade` can move NetBird past `netbird_version`. The next plan then shows the difference.

### The signing keys

NetBird signs its apt and rpm repositories with different keys, both copied from `pkgs.netbird.io`: `EFE3 7DF0 47DF 7CCD F1FC 54FA 83F7 9AD0 2977 8355` in `files/netbird-deb.asc` and `AA9C 09AA 9DEA 2F58 112B 40DF DFFE AB2F D267 A61F` in `files/netbird-rpm.asc`. Neither expires.

### The management server

This circuit is the client. NetBird's self-hosted server, the management, signal and relay services in one container plus the dashboard and a reverse proxy for TLS, ships as a Docker Compose stack from NetBird's own [getting-started script](https://docs.netbird.io/selfhosted/selfhosted-quickstart). Run that on the host you want as your server, then point this circuit's `management_url` at it.

CI joins a server of its own, started from NetBird's `netbird-server` image with plain HTTP and a throwaway config in [examples/local](https://github.com/conn3xorg/circuit-netbird/blob/v0.1.0/examples/local/netbird-server.yaml), so every run tests a real join. That config isn't one to run a network on: it has no TLS and no dashboard.

### What it doesn't do

- **`hostname` and `extra_args` apply only when a host joins.** Changing either on a joined host does nothing. Run `netbird up` with the new flags on the host, or remove it from the network with `netbird deregister` and apply again with a key.
- **It doesn't log hosts out.** Removing the module, or setting `join = false`, leaves a joined host in the network.
- **`hostname` names every host the same.** Use it with a single host, or leave it null to take each host's own name.
- **It doesn't set up routes, groups or access policies.** Those live on the management server.
- **It doesn't touch the host firewall.** NetBird adds its own rules for its interface.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `netbird_version` | string | `"0.82.0"` | NetBird client release to install. |
| `management_url` | string | `"https://api.netbird.io:443"` | Management server to join, such as `"https://netbird.example.com:443"`. |
| `join` | bool | `true` | Join the hosts with `setup_key`. When false, install NetBird only. |
| `setup_key` | string, sensitive, ephemeral | `null` | Setup key to join with. Ephemeral and sensitive. Required when `join` is true. |
| `hostname` | string | `null` | Name for the peer: letters, digits and `-`. When null, the host's own name. Used only when joining. |
| `extra_args` | list(string) | `[]` | More flags for `netbird up`, such as `["--disable-dns"]`. One flag per item, no spaces or quotes. Used only when joining. |

The `os` in a host object, one of `debian`, `ubuntu`, `rocky`, `almalinux`, `rhel` or `fedora`, stands in for the facts of a host created in the same plan.

`join` is separate from `setup_key` because OpenTofu won't let a step's count depend on an ephemeral value.

## Outputs

| Name | Description |
| --- | --- |
| `service` | The systemd unit the client runs as, `netbird.service`. |

## Requirements

Requires Conn3x v0.7.0 or later and systemd on each host, with outbound HTTPS to pkgs.netbird.io and to your management server. In a container, the host needs `/dev/net/tun`.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI starts a self-hosted NetBird server, makes its first user and a setup key through NetBird's setup API, and applies [examples/local](https://github.com/conn3xorg/circuit-netbird/tree/v0.1.0/examples/local) to each distribution on amd64, joining at NetBird 0.81.5, then upgrading to 0.82.0. After each apply it checks that the second plan has no changes. A second peer joins and pings the host across the network after the join, after the upgrade, after restarting the host, and after switching `join` off, which deletes the key file. CI also checks the key stayed out of state. The CI containers run with SELinux off. The same steps also passed by hand on Ubuntu 24.04 and Rocky Linux 10 droplets, the Rocky one with SELinux enforcing and no denials in the audit log, joined to the same self-hosted server and pinging each other, including after a reboot of both followed by a clean plan.

Joining NetBird's cloud isn't covered, because it needs a real account and key.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-netbird/blob/v0.1.0/LICENSE). NetBird's client is BSD-3-Clause; its management, signal and relay services are AGPL-3.0.

## Source

- Repository: [conn3xorg/circuit-netbird](https://github.com/conn3xorg/circuit-netbird). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-netbird/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-netbird/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-netbird/tree/v0.1.0/examples/local).
- Related circuits: [WireGuard](/circuits/wireguard), [Tailscale](/circuits/tailscale), [keepalived](/circuits/keepalived), [Cloudflare Tunnel](/circuits/cloudflared).
