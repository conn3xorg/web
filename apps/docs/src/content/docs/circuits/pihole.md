---
title: Pi-hole
description: "Pi-hole ad blocking for your whole network from the official image under Podman, with local DNS records and blocklists."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-pihole at v0.1.0. -->

A Conn3x circuit that runs [Pi-hole](https://pi-hole.net) on your hosts, so every device on the network that asks it for DNS gets ads and trackers answered with `0.0.0.0`. Phones, TVs and the smart plug you can't install anything on all get the same treatment, because blocking happens at the one place they all ask.

Pi-hole runs from its official image, `pihole/pihole`, under Podman as a systemd service. You give it upstream servers, a password, any extra blocklists and the local names your homelab answers to, such as `nas.home.arpa`, and the same setup lands on Debian, Ubuntu, Fedora and Rocky Linux. On Ubuntu, Fedora and Debian cloud images, where `systemd-resolved` already holds port 53, the circuit moves it out of the way first.

## Usage

```hcl
variable "pihole_password" {
  type      = string
  ephemeral = true
}

module "pihole" {
  source = "github.com/conn3xorg/circuit-pihole?ref=v0.1.0"

  hosts                = { dns = "192.168.1.2" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  web_password = var.pihole_password
  upstream_dns = ["9.9.9.9", "149.112.112.112"]
  blocklists   = ["https://big.oisd.nl"]

  local_dns_records = {
    "nas.home.arpa"     = "192.168.1.20"
    "printer.home.arpa" = "192.168.1.21"
  }
}
```

Then run `conn3x init` and `conn3x apply -var pihole_password=...`. A second `conn3x plan` says `No changes.` Point your router's DHCP at the host's address as the DNS server, and the network starts using it as leases renew.

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry:

```hcl
hosts = {
  for name, d in digitalocean_droplet.dns : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-pihole/tree/v0.1.0/examples/local).

### Don't run an open resolver

A DNS server that answers anyone on the internet gets used to amplify attacks on other people. The default, `listening_mode = "LOCAL"`, only answers devices on the host's own subnets, which is right for a box on your LAN. On a cloud server, a host's "own subnet" can be shared with strangers, so there either firewall port 53 to your own addresses (see [circuit-firewall](/circuits/firewall)) or bind Pi-hole to one interface, such as a WireGuard or Tailscale one:

```hcl
listening_mode = "BIND"
interface      = "tailscale0"
web_port       = "127.0.0.1:8080"
```

## Why a container

Pi-hole has two official ways in: its installer script, and the `pihole/pihole` image. This circuit uses the image, for three reasons.

- **One pin covers everything.** Pi-hole is three projects: the core scripts, the web interface and FTL, the DNS server. An image tag such as `2026.10.0` fixes all three. The installer can be fetched from a tag, but it then clones the core and web repositories from their main branches and downloads FTL's latest release, so two hosts installed a week apart can differ.
- **Upgrades are a diff.** Change `pihole_version`, and `conn3x plan` shows the new image in the unit file. The apply restarts the service on the new image, and gravity, the query log and settings stay in the `pihole` volume. With the installer, an upgrade is `pihole -up`, which moves to whatever is latest.
- **The same on every distribution.** The installer supports Debian, Ubuntu, Fedora and CentOS Stream, but not Rocky Linux or AlmaLinux. Podman is in all of their repositories.

The container uses the host's network rather than a published port, so Pi-hole's query log shows each device's own address, and `listening_mode` and `interface` refer to the host's real interfaces.

## What it does

On each host, in order:

1. Writes `/etc/systemd/resolved.conf.d/conn3x-pihole.conf` with `DNSStubListener=no`, and restarts `systemd-resolved` if it's running. Its stub listener holds port 53 on `127.0.0.53` and `127.0.0.54`, and Pi-hole can't start while it does. resolved keeps running for everything else. On a host without resolved, such as Rocky Linux, the file sits unused.
2. If `/etc/resolv.conf` points at resolved's stub, points it at `/run/systemd/resolve/resolv.conf`, which lists the real upstream servers. Without this the host loses DNS when the stub goes, and can't pull Pi-hole's image. The host itself keeps asking those servers, not Pi-hole.
3. Through [circuit-podman](/circuits/podman) v0.1.0, installs Podman and runs `docker.io/pihole/pihole:VERSION` as `pihole.service`: a Quadlet unit on the host network, with `/etc/pihole` on the named volume `pihole`. The password goes into `/etc/containers/env/pihole.env`, mode `0600`.
4. Waits for port 53. On its first start the container builds gravity from Pi-hole's default list, [StevenBlack's hosts](https://github.com/StevenBlack/hosts), before it opens the port, which takes a minute or two.
5. Adds `blocklists` to gravity's database, removes lists the circuit added before that you've since taken out, and runs `pihole -g` to rebuild gravity. When the lists already match, it does nothing.

Settings reach Pi-hole as `FTLCONF_` environment variables in the unit, which Pi-hole reads over `pihole.toml`. A setting given that way is greyed out in the web interface, so the configuration here stays the one that counts. Taking a setting out, such as the last of `local_dns_records`, returns it to Pi-hole's default. A change to any input restarts the container, which takes a few seconds of DNS downtime.

The circuit turns off Pi-hole's built-in NTP server and clock sync. With host networking the server would answer NTP queries from anyone who can reach port 123, and a container can't set the host's clock anyway.

Blocklists the circuit adds carry the comment `Managed by Conn3x`. Lists you add in the web interface don't, and the circuit leaves them alone. If you add a URL in the web interface that's also in `blocklists`, the circuit takes it over.

### What it doesn't do

- It doesn't open port 53 or the web port in a firewall. Allow 53/udp and 53/tcp from your network, and the web port from wherever you manage it.
- It doesn't set up DHCP. Pi-hole's DHCP server needs the `NET_ADMIN` capability, which the container doesn't get, and your router's DHCP is usually fine.
- It doesn't manage allowlists, denylists, groups or clients. Set those in the web interface; they live in the volume and survive upgrades.
- It doesn't make Pi-hole the host's own resolver.
- With the default `web_port`, the web interface listens on ports 80 and 443 on every address. That collides with nginx, Caddy or anything else on those ports: set `web_port`, such as `"8080"`, on a host that runs a web server.
- Deleting the module leaves Podman, the container and the `pihole` volume in place, and the resolved drop-in with them.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.2"`, or a host object such as `{ address = "192.168.1.2", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `web_password` | string, sensitive, ephemeral | Required | Password for the web interface and the API, 8 characters or more. Ephemeral and sensitive: it reaches the host's env file but never the plan or state. Changing it restarts the container. |
| `pihole_version` | string | `"2026.10.0"` | Tag of `docker.io/pihole/pihole`. `2026.10.0` is Pi-hole core v6.5, web v6.6.1 and FTL v6.8. |
| `upstream_dns` | list(string) | `["9.9.9.9", "149.112.112.112"]` | Servers Pi-hole forwards allowed queries to, optionally with `#port`, such as `"127.0.0.1#5335"` for a local Unbound. The default is Quad9. |
| `listening_mode` | string | `"LOCAL"` | `LOCAL` answers devices on the host's own subnets, `SINGLE` only queries arriving on `interface`, `BIND` binds to `interface` alone, `ALL` answers anyone who can reach port 53, and `NONE` leaves it to you. |
| `interface` | string | `null` | Interface for `SINGLE` and `BIND`, such as `"eth0"` or `"lo"`. When null, Pi-hole uses the one with the default route. |
| `blocklists` | list(string) | `[]` | Blocklist URLs to add to Pi-hole's default list, such as `["https://big.oisd.nl"]`. Hosts files, plain domain lists and Adblock-style lists all work. |
| `local_dns_records` | map(string) | `{}` | Local DNS records, names to IPv4 or IPv6 addresses, such as `{ "nas.home.arpa" = "192.168.1.20" }`. |
| `web_port` | string | `null` | Where the web interface listens, in Pi-hole's `webserver.port` syntax, such as `"8080"` or `"127.0.0.1:8080"`. When null, ports 80 and 443 with a self-signed certificate. |

## Outputs

| Name | Description |
| --- | --- |
| `service` | The systemd service that runs Pi-hole, `pihole.service`. |
| `image` | The image the hosts run, such as `docker.io/pihole/pihole:2026.10.0`. |

## Requirements

Requires Conn3x v0.6.5 or later and systemd on each host. The image is built for amd64 and arm64, and for 32-bit ARM, i386 and riscv64, which haven't been tried. Each host needs to reach its package mirror, Docker Hub, GitHub and the blocklists' servers. `conn3x init` fetches circuit-podman from GitHub.

Pi-hole's own sizing applies: 1 GB of memory and a couple of GB of disk are plenty for a home network.

## Raspberry Pi OS

A Raspberry Pi is the classic home for Pi-hole. Raspberry Pi OS is Debian with Raspberry Pi's kernel and firmware, it has Podman in its repositories, and the image is built for arm64, so this circuit should work on a 64-bit Raspberry Pi OS. It hasn't been tried there yet.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-pihole/tree/v0.1.0/examples/local) to each on amd64, checks that the second plan has no changes, then asks Pi-hole over `dig` for `doubleclick.net`, which StevenBlack's list blocks, and expects `0.0.0.0`; for `example.com`, which has to resolve normally; and for `nas.home.arpa`, which has to come back as the example's `192.168.1.20`. It checks the extra blocklist made it into gravity with domains in it, and that the API accepts the example's password and turns down a wrong one.

The same checks passed by hand on Ubuntu 24.04 and Debian 13 droplets with 1 GB of memory, both running `systemd-resolved` with its stub on: the stub went, the hosts kept their own DNS, and Pi-hole took port 53. They ran with `listening_mode = "BIND"`, `interface = "lo"` and `web_port = "127.0.0.1:8080"`; from outside, port 53 timed out and the web port didn't answer. After a reboot Pi-hole came back, the checks passed again and the plan had no changes. Emptying `blocklists` removed the extra list and left the default one, and putting it back added it again, each with a clean plan after.

Upgrading from one `pihole_version` to the next hasn't been tried yet.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-pihole/blob/v0.1.0/LICENSE). Pi-hole itself is under the EUPL.

## Source

- Repository: [conn3xorg/circuit-pihole](https://github.com/conn3xorg/circuit-pihole). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-pihole/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-pihole/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-pihole/tree/v0.1.0/examples/local).
- Related circuits: [Firewall](/circuits/firewall), [Podman](/circuits/podman), [AdGuard Home](/circuits/adguardhome), [Unbound](/circuits/unbound), [BIND](/circuits/bind).
