---
title: fail2ban
description: "Bans addresses that keep failing SSH logins, through nftables, with room for jails of your own."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-fail2ban at v0.2.0. -->

A Conn3x circuit that installs fail2ban and turns on its SSH jail, so an address that keeps failing to log in gets banned for a while instead of guessing passwords all night. Any internet-facing box sees this within minutes of coming up; `journalctl -u sshd` on one is usually a wall of `Invalid user admin`.

You set the ban time, the window and the number of tries once, and the same settings land on Debian, Ubuntu, Fedora and Rocky Linux. The circuit picks the parts that differ per distribution: EPEL on Rocky Linux and AlmaLinux, the right package names, and the systemd journal as the log source, since Debian 13, Fedora and Rocky Linux don't write `/var/log/auth.log` or `/var/log/secure` out of the box. You can add more jails, such as one for nginx, from the filters fail2ban ships.

## Usage

```hcl
module "fail2ban" {
  source = "github.com/conn3xorg/circuit-fail2ban?ref=v0.2.0"

  hosts                = { web1 = "203.0.113.10", web2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  bantime  = 86400
  maxretry = 3
  ignoreip = ["198.51.100.7"]

  jails = {
    nginx-http-auth = { port = "http,https", logpath = "/var/log/nginx/error.log" }
  }
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

Put your own address in `ignoreip`. Without it, a few mistyped passwords from your desk ban you like anyone else.

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry. Give each one's distribution in `os` too: the circuit picks its packages by distribution, and Conn3x can't ask a host that doesn't exist yet. If `os` turns out not to match the host, Conn3x stops before configuring it. Set `os` as well when you put `depends_on` on this module: `depends_on` holds back reading the hosts until the apply, so without `os` the plan fails with `Invalid for_each argument`.

```hcl
hosts = {
  for name, d in digitalocean_droplet.web : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
    os       = "ubuntu"
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-fail2ban/tree/v0.2.0/examples/local).

### SSH on another port, or behind a port forward

The sshd jail bans on the port Conn3x logs in on to each host: the host object's `port`, or `ssh_port`. When sshd listens on a different port from the one you connect to, such as behind a port forward or NAT, set `sshd_port` to the port sshd listens on. It applies to every host.

## What it does

On each host, in order:

1. On Rocky Linux and AlmaLinux, installs `epel-release` from the distribution's extras repository, which turns on EPEL. fail2ban isn't in their own repositories. EPEL stays on afterwards. RHEL doesn't ship `epel-release`, so on RHEL turn EPEL on yourself first, or the install fails.
2. Installs fail2ban: `fail2ban-server` on the Red Hat family, which leaves out the firewalld and sendmail add-ons the `fail2ban` package pulls in, and `fail2ban` on Debian and Ubuntu. Then `python3-systemd`, which fail2ban needs to read the journal, and `nftables`.
3. Creates `/var/log/fail2ban.log` if it's missing, so a `recidive` jail can read it on the first start. Then writes `/etc/fail2ban/jail.d/conn3x.local` with your settings, the `sshd` jail and your extra jails. It leaves `jail.conf` and the distribution's own files in `jail.d` alone; settings in a `.local` file there override them.
4. Starts fail2ban now and at boot, waits for its socket, and reloads it when the file changes.

The file's `[DEFAULT]` section sets `backend = systemd`, so every jail reads the systemd journal unless it names a `logpath`. A jail with a `logpath` and no `backend` gets `backend = auto`, which reads that file.

Bans go through the `nftables` action by default, which keeps its rules in a table of its own, `inet f2b-table`. That works next to ufw and firewalld, so this circuit sits fine alongside [circuit-firewall](/circuits/firewall). To ban through firewalld or ufw instead, set `banaction` to `firewallcmd-rich-rules` or `ufw`.

`127.0.0.1/8` and `::1` are always in `ignoreip`.

Before the circuit runs, the `conn3x_host` data source reads each host's distribution over SSH, which decides whether EPEL is needed and which package to install.

### What it doesn't do

- It doesn't write filters. Extra jails use the filters in `/etc/fail2ban/filter.d`, and `filter` defaults to the jail's name, as in fail2ban itself.
- It doesn't install what an extra jail watches, or make that service log where the jail looks.
- It doesn't set up email or other notifications on a ban.
- Deleting a jail from `jails` removes it from the file and the reload stops it. Deleting the module leaves fail2ban installed and running with the last file.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`, the distribution's ID, such as `ubuntu` or `rocky`, which a host created in the same plan needs. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `sshd_port` | number | `null` | Port sshd listens on, which the sshd jail bans on, for every host. When null, each host's own SSH port. |
| `bantime` | number | `3600` | Seconds an address stays banned. `-1` bans it for good. |
| `findtime` | number | `600` | Window, in seconds, in which `maxretry` failures lead to a ban. |
| `maxretry` | number | `5` | Failures within `findtime` that ban an address. |
| `ignoreip` | list(string) | `[]` | Addresses and CIDR networks never banned, such as `["192.168.1.0/24", "2001:db8::/32"]`. |
| `banaction` | string | `"nftables"` | fail2ban action that bans an address, the name of a file in `/etc/fail2ban/action.d`, such as `firewallcmd-rich-rules` or `ufw`. |
| `jails` | map(object) | `{}` | Extra jails, by name. Each takes optional `enabled` (default `true`), `port`, `filter`, `logpath`, `backend` (`auto`, `systemd`, `polling` or `pyinotify`) and `maxretry`. A jail can't be named `sshd`. |

## Outputs

| Name | Description |
| --- | --- |
| `jail_file` | Path of the file the circuit writes, `/etc/fail2ban/jail.d/conn3x.local`. |
| `jails` | Names of the jails turned on, such as `["sshd", "nginx-http-auth"]`. |

## Requirements

Requires Conn3x v0.6.5 or later and systemd on each host, with a package mirror the host can reach. On Rocky Linux and AlmaLinux, the host also needs to reach EPEL's mirrors; on RHEL, EPEL must already be on.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-fail2ban/tree/v0.2.0/examples/local) to each on amd64, checks that the second plan has no changes, checks the `sshd` jail runs with the example's ban time, bans an address to check it lands in nftables, and bans it again to check `recidive` picks it up from fail2ban's log.

The CI containers run with SELinux off. On Fedora and Rocky Linux, `fail2ban-server` pulls in `fail2ban-selinux` when the targeted policy is installed. On a Rocky Linux 10 droplet with SELinux enforcing, the same checks passed by hand: fail2ban ran confined as `fail2ban_t`, the ban landed in nftables, `recidive` picked it up, and the audit log had no denials. On Fedora 44 and AlmaLinux 10 droplets, also enforcing, the `sshd` jail came up and came back after a reboot with no denials; bans weren't retried there.

SSH on another port was tried by hand on an Ubuntu 24.04 droplet with sshd on port 2222 and `port = 2222` in the host object. After a second droplet failed to log in on 2222 a few times, it was banned: its connections to 2222 were refused, while port 22, which the jail doesn't cover, still answered it.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-fail2ban/blob/v0.2.0/LICENSE). fail2ban itself is GPL-2.0.

## Source

- Repository: [conn3xorg/circuit-fail2ban](https://github.com/conn3xorg/circuit-fail2ban). This page covers [v0.2.0](https://github.com/conn3xorg/circuit-fail2ban/tree/v0.2.0); the repository's [tags](https://github.com/conn3xorg/circuit-fail2ban/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-fail2ban/tree/v0.2.0/examples/local).
- Related circuits: [Firewall](/circuits/firewall), [Baseline](/circuits/baseline), [Hardening](/circuits/hardening), [Automatic updates](/circuits/auto-updates), [OpenSCAP](/circuits/openscap), [auditd](/circuits/auditd), [Trivy](/circuits/trivy), [CISO Assistant](/circuits/ciso-assistant).
