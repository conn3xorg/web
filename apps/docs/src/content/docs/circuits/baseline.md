---
title: Baseline
description: "A sensible start for any server: time zone, chrony, sysctl settings and SSH that only takes keys."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-baseline at v0.1.0. -->

A Conn3x circuit that gives every host the same starting point: a time zone, chrony keeping the clock, a few kernel network settings, and SSH that only accepts keys. You pass in your hosts, and it does the same thing on Rocky Linux, Fedora, Ubuntu and Debian, picking the right service names for each.

Root can still log in with a key afterwards (`PermitRootLogin prohibit-password`), so applying this over a root key login doesn't lock you out.

## Usage

```hcl
module "baseline" {
  source = "github.com/conn3xorg/circuit-baseline?ref=v0.1.0"

  hosts = {
    web1 = "203.0.113.10"
    web2 = "203.0.113.11"
  }
  ssh_private_key_file = "~/.ssh/id_ed25519"
  timezone             = "Europe/Dublin"
}
```

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry:

```hcl
module "baseline" {
  source = "github.com/conn3xorg/circuit-baseline?ref=v0.1.0"

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

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-baseline/tree/v0.1.0/examples/local).

## What it does

On each host, in order:

1. Installs `tzdata` and sets the time zone.
2. Installs chrony and starts it now and at boot (`chronyd` on Rocky and Fedora, `chrony` on Debian and Ubuntu).
3. Sets each kernel parameter in `sysctl`, in the running kernel and in `/etc/sysctl.d`.
4. Writes `sshd_settings` to `/etc/ssh/sshd_config.d/00-conn3x-baseline.conf`, checks the result with `sshd -t`, and reloads sshd (`sshd` or `ssh`) only when the file changed.

sshd keeps the first value it reads for each keyword, and all four distros include `sshd_config.d` at the top of `sshd_config`. The `00-` drop-in sorts first, so it wins over `sshd_config` and over drop-ins such as Ubuntu's `50-cloud-init.conf`. If the check fails, the apply stops before the reload and the running sshd keeps its old settings.

Before the circuit runs, the `conn3x_host` data source reads each host's OS family over SSH, which picks the service names.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `timezone` | string | `"UTC"` | IANA time zone, such as `"Europe/Dublin"`. |
| `chrony_set_clock` | bool | `true` | Let chronyd set the system clock. Set it to `false` in containers, and on VMs whose hypervisor sets the clock, so chronyd runs with `-x`. |
| `sysctl` | map(string) | See below | Kernel parameters to set, by name. |
| `sshd_settings` | map(string) | `{ PasswordAuthentication = "no", PermitRootLogin = "prohibit-password" }` | sshd keywords and values for the drop-in. |

The default `sysctl` turns on SYN cookies, ignores ICMP redirects and broadcast pings, and stops the host sending redirects:

```hcl
{
  "net.ipv4.tcp_syncookies"                = "1"
  "net.ipv4.conf.all.accept_redirects"     = "0"
  "net.ipv4.conf.default.accept_redirects" = "0"
  "net.ipv4.conf.all.send_redirects"       = "0"
  "net.ipv4.icmp_echo_ignore_broadcasts"   = "1"
}
```

Setting `sysctl` replaces this map, so copy the entries you want to keep. Pass `{}` to set none.

Before you set `PermitRootLogin` to `"no"`, make sure `ssh_user` is a user that can log in and use sudo, with `ssh_become = true`. Otherwise the next plan can't reach the host.

## Outputs

None.

## Requirements

Requires Conn3x v0.6.4 or later and systemd on each host.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-baseline/tree/v0.1.0/examples/local) to each and checks that the second plan has no changes.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-baseline/blob/v0.1.0/LICENSE).

## Source

- Repository: [conn3xorg/circuit-baseline](https://github.com/conn3xorg/circuit-baseline). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-baseline/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-baseline/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-baseline/tree/v0.1.0/examples/local).
- Related circuits: [Hardening](/circuits/hardening), [Firewall](/circuits/firewall), [fail2ban](/circuits/fail2ban), [Automatic updates](/circuits/auto-updates), [OpenSCAP](/circuits/openscap).
