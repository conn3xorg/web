---
title: Firewall
description: "A default-deny ufw or firewalld firewall, picked per host, that opens SSH before it turns on."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-firewall at v0.2.0. -->

A Conn3x circuit that turns on each host's firewall with a default of deny, and opens the ports you list. It uses ufw on Debian and Ubuntu and firewalld on Rocky Linux, AlmaLinux, RHEL and Fedora, picked per host, so one list of ports works across a mixed fleet.

The part that usually goes wrong by hand is the order. Turn ufw on before SSH is allowed and you've locked yourself out. This circuit opens SSH first, on the port Conn3x logs in on, then turns the firewall on.

## Usage

```hcl
module "firewall" {
  source = "github.com/conn3xorg/circuit-firewall?ref=v0.2.0"

  hosts                = { web1 = "203.0.113.10", web2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  allow = [
    { port = "80/tcp" },
    { port = "443/tcp" },
    { port = "9100/tcp", from = "10.0.0.0/8" },
  ]
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

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

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-firewall/tree/v0.2.0/examples/local).

### SSH on another port, or behind a port forward

SSH stays open on `ssh_port`, and on the `port` of every host object. When something between Conn3x and the hosts changes the port, such as a router forwarding 2222 to a server's 22, give the port sshd really listens on:

```hcl
ssh_port  = 2222
ssh_allow = ["22/tcp"]
```

## What it does

On Debian and Ubuntu, in order:

1. Installs `ufw`.
2. Allows SSH, then each port in `allow`.
3. Sets incoming traffic to deny by default.
4. Turns ufw on.

On the Red Hat family, in order:

1. Installs `firewalld`.
2. If SSH runs on a port other than 22, opens it with `firewall-offline-cmd` before firewalld starts, so starting it can't cut the connection.
3. Starts firewalld now and at boot. Its default zone denies incoming traffic except what it allows, which includes SSH on port 22.
4. Opens SSH and each port in `allow`, in the running firewall and permanently. A port with `from` becomes a rich rule that accepts it from that address or network only.

Before the circuit runs, the `conn3x_host` data source reads each host's family over SSH and splits the hosts between the two.

The circuit only adds rules. It doesn't remove what was already allowed, such as the `cockpit` and `dhcpv6-client` services in firewalld's default zone on Rocky Linux. Taking a port out of `allow` closes it again, except a firewalld rule with `from`, which stays until you remove it with `firewall-cmd --remove-rich-rule`.

Docker publishes container ports through its own firewall rules, which bypass both ufw and firewalld: a published port answers from outside even when this circuit doesn't allow it. On a Docker host, publish containers on `127.0.0.1` or put the firewall in front of them some other way.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`, the distribution's ID, such as `ubuntu` or `rocky`, which a host created in the same plan needs. The two forms can be mixed. |
| `allow` | list(object) | `[]` | Ports to open, each with a protocol, such as `{ port = "443/tcp" }`, or `{ port = "5432/tcp", from = "10.0.0.0/8" }` to open it to one address or network. A range is written `6000:6007/tcp`. |
| `ssh_allow` | list(string) | `null` | Ports sshd listens on, such as `["22/tcp"]`. When null, the ports Conn3x logs in on. Can't be empty. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |

## Outputs

This circuit has no outputs.

## Requirements

Requires Conn3x v0.6.5 or later, which applies several ufw rules on one host without losing any, and systemd on each host.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-firewall/tree/v0.2.0/examples/local) to each on amd64, checks that the second plan has no changes, and checks that the firewall is on with every rule in place.

It was also applied by hand, with circuit-docker, circuit-monitoring and four other circuits, to an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing. On both, port 80 answered from outside, port 9100 didn't, and a rule with `from` let only that network in: the Docker bridge reached node_exporter on 9100. A container port published on 8081, which no rule allowed, still answered from outside on both, as above. After a reboot the firewall came back with every rule and the plan had no changes. A separate run created an Ubuntu 24.04 droplet and applied this circuit to it in one `conn3x apply`, with `os = "ubuntu"`, and the second plan had no changes. The same checks passed on Fedora 44, with SELinux enforcing, and Debian 13 droplets, before and after a reboot.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-firewall/blob/v0.2.0/LICENSE).

## Source

- Repository: [conn3xorg/circuit-firewall](https://github.com/conn3xorg/circuit-firewall). This page covers [v0.2.0](https://github.com/conn3xorg/circuit-firewall/tree/v0.2.0); the repository's [tags](https://github.com/conn3xorg/circuit-firewall/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-firewall/tree/v0.2.0/examples/local).
- Related circuits: [Baseline](/circuits/baseline), [Hardening](/circuits/hardening), [fail2ban](/circuits/fail2ban), [Automatic updates](/circuits/auto-updates), [OpenSCAP](/circuits/openscap).
