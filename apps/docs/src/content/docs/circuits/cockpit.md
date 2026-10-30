---
title: Cockpit
description: "Cockpit, the web console for Linux servers, with your port, extra pages, TLS certificate and root login off."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-cockpit at v0.1.0. -->

A Conn3x circuit that installs Cockpit, the web console for Linux servers, and sets how it listens, which certificate it serves and who may log in. Cockpit gives you a server's logs, services, storage, network, updates and a terminal in the browser, logged in with the server's own accounts. It's the thing you open when SSH would do but a graph of the last hour would do better.

You pick the port, the address, the extra pages and the certificate once, and the same settings land on Debian, Ubuntu, Fedora and Rocky Linux. The circuit handles the parts that differ: backports on Debian and Ubuntu, as Cockpit's own install guide recommends, SELinux's port list on the Red Hat family, and the extra pages each distribution packages. Root can't log in unless you say so.

## Usage

```hcl
module "cockpit" {
  source = "github.com/conn3xorg/circuit-cockpit?ref=v0.1.0"

  hosts                = { web1 = "203.0.113.10", web2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  packages    = ["cockpit-podman", "cockpit-files"]
  login_title = "web servers"
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.` Browse to `https://203.0.113.10:9090/` and log in with an account on that server. Cockpit's self-signed certificate means a browser warning until you give it a real one.

Cockpit logs in with the server's passwords, so put it behind a firewall or a VPN rather than on the open internet, and give the accounts that use it strong passwords. [circuit-firewall](/circuits/firewall) can keep the port to your own network, and [circuit-fail2ban](/circuits/fail2ban) can ban addresses that keep failing to log in.

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

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-cockpit/tree/v0.1.0/examples/local).

### A real certificate

Point `tls_certificate` and `tls_key` at a certificate and its key on the host. The circuit links them into `/etc/cockpit/ws-certs.d` as `zz-conn3x.crt` and `zz-conn3x.key`, which Cockpit picks over its own self-signed one. Cockpit reads them as root, so the key can stay mode `0600`.

With [circuit-certbot](/circuits/certbot), use the paths under `live`, and have certbot restart Cockpit after each renewal so it serves the new certificate:

```hcl
module "certbot" {
  source = "github.com/conn3xorg/circuit-certbot?ref=v0.1.0"
  # ...
  deploy_hook = "systemctl try-restart cockpit"
}

module "cockpit" {
  source = "github.com/conn3xorg/circuit-cockpit?ref=v0.1.0"
  # ...
  tls_certificate = "/etc/letsencrypt/live/cockpit.example.com/fullchain.pem"
  tls_key         = "/etc/letsencrypt/live/cockpit.example.com/privkey.pem"
}
```

The same goes for any certificate you already have for [circuit-apache](/circuits/apache) or another web server: Cockpit can use the same files.

### Behind a reverse proxy

To serve Cockpit at `https://cockpit.example.com` through Apache, nginx or Caddy, keep Cockpit on loopback and tell it about the proxy:

```hcl
  address           = "127.0.0.1"
  origins           = ["https://cockpit.example.com"]
  behind_proxy      = true
  allow_unencrypted = true
```

`origins` lets the browser's WebSocket in from the proxy's address. `behind_proxy` makes Cockpit read `X-Forwarded-Proto` and `X-Forwarded-For`, which only the proxy should be able to set; that's why Cockpit listens on loopback. `allow_unencrypted` is for a proxy that talks plain HTTP to Cockpit; leave it out if the proxy connects over HTTPS. The proxy has to pass WebSocket upgrades through, as Cockpit's [proxy guide](https://github.com/cockpit-project/cockpit/wiki/Proxying-Cockpit-over-Apache-with-LetsEncrypt) shows for Apache.

## What it does

On each host, in order:

1. On Debian and Ubuntu, with `backports` on: adds `<codename>-backports` to Debian's apt sources unless it's there already (Ubuntu has it out of the box), then runs `apt-get install -t <codename>-backports cockpit` with your extra pages, the way Cockpit's install guide does. With `backports` off, the same packages come from the release.
2. On the Red Hat family: installs `cockpit` and your extra pages with dnf. When `port` isn't 9090, adds it to SELinux's `websm_port_t`, the type Cockpit may listen on, with `semanage`.
3. Writes `/etc/cockpit/cockpit.conf` with `AllowUnencrypted`, and `Origins`, `LoginTitle` and the proxy headers when you set them.
4. Adds `root` to `/etc/cockpit/disallowed-users`, which Cockpit's PAM stack checks, or takes it out with `root_login = true`.
5. Links your certificate and key into `/etc/cockpit/ws-certs.d`, when you set them.
6. Writes `/etc/systemd/system/cockpit.socket.d/listen.conf` with the port and address, reloads systemd when it changes, and starts `cockpit.socket` now and at boot. systemd listens on the port and starts Cockpit on the first connection.
7. Restarts `cockpit.socket`, which restarts Cockpit with it, when the config, the certificate links or the port change. That logs out anyone using Cockpit at the time.

`cockpit` pulls in the pages the distribution recommends with it: on Debian and Ubuntu that includes `cockpit-networkmanager`, which installs NetworkManager. On the Ubuntu 24.04 droplet it was tested on, NetworkManager left netplan's interfaces unmanaged, and the network came back as before after a reboot.

Rocky Linux and RHEL cloud images often have `cockpit.socket` on 9090 already. The circuit takes it over: the drop-in sets the port, and the restart moves it.

Before the circuit runs, the `conn3x_host` data source reads each host's distribution over SSH. If you ask for a page the distribution doesn't package, such as `cockpit-pcp` on Fedora, the plan stops with an error naming the host and the page.

| Page | Debian 13 | Ubuntu 24.04 | Fedora 45 | Rocky Linux 10 |
| --- | --- | --- | --- | --- |
| `cockpit-files`, `-machines`, `-networkmanager`, `-packagekit`, `-podman`, `-sosreport`, `-storaged` | Yes | Yes | Yes | Yes |
| `cockpit-kdump`, `-ostree`, `-selinux` | No | No | Yes | Yes |
| `cockpit-pcp` | No | Yes | No | No |

On Rocky Linux and RHEL 10, `cockpit-networkmanager`, `-selinux`, `-kdump` and `-sosreport` are part of `cockpit-system`, which `cockpit` installs; asking for them is fine.

### What it doesn't do

- It doesn't open the port in a firewall. On a host with firewalld or ufw on, open it with [circuit-firewall](/circuits/firewall) or by hand.
- It doesn't create users or set passwords. Log in with an account that's in the `sudo` or `wheel` group, then turn on administrative access in Cockpit's top bar.
- It doesn't set up the reverse proxy itself, or get a certificate.
- It doesn't upgrade Cockpit after the first install. On Debian and Ubuntu, upgrade with `apt-get install -t <codename>-backports cockpit` to stay on backports.
- Deleting the module leaves Cockpit installed and listening, with the last config.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`, the distribution's ID, such as `ubuntu` or `rocky`, which a host created in the same plan needs. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `packages` | list(string) | `[]` | Extra Cockpit pages, such as `["cockpit-podman", "cockpit-machines"]`. See the table above for which distribution has which. |
| `backports` | bool | `true` | On Debian and Ubuntu, install from `<codename>-backports`, which carries a newer Cockpit than the release. |
| `port` | number | `9090` | TCP port Cockpit listens on. |
| `address` | string | `null` | IP address Cockpit listens on, such as `"127.0.0.1"`. When null, every address. |
| `origins` | list(string) | `[]` | Other origins the browser may reach Cockpit from, such as `["https://cockpit.example.com"]`. Cockpit always accepts its own address. |
| `login_title` | string | `null` | Browser title for the login page. When null, Cockpit's default. |
| `allow_unencrypted` | bool | `false` | Accept plain HTTP from other hosts instead of redirecting it to HTTPS. Only for a reverse proxy that talks HTTP to Cockpit. |
| `behind_proxy` | bool | `false` | Trust `X-Forwarded-Proto` and `X-Forwarded-For` from a reverse proxy. Set it only when nothing but the proxy can reach Cockpit's port. |
| `tls_certificate` | string | `null` | Path on the host of a PEM certificate with its chain, such as `/etc/letsencrypt/live/cockpit.example.com/fullchain.pem`. When null, Cockpit's self-signed certificate. |
| `tls_key` | string | `null` | Path on the host of the certificate's unencrypted private key. Set it with `tls_certificate`. |
| `root_login` | bool | `false` | Let root log in to Cockpit with its password. |

## Outputs

| Name | Description |
| --- | --- |
| `urls` | Cockpit's address on each host, such as `{ web1 = "https://203.0.113.10:9090/" }`. |

## Requirements

Requires Conn3x v0.6.9 or later and systemd on each host, with a package mirror the host can reach. On Debian, the host also needs to reach `deb.debian.org` for backports, unless `backports` is off.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-cockpit/tree/v0.1.0/examples/local) to each on amd64, checks that the second plan has no changes, that `cockpit.socket` is on and the login page answers on 9090 with the example's title, then creates a test user in the container and checks it logs in, a wrong password doesn't, and root is turned away.

The CI containers run with SELinux off. On a Rocky Linux 10 droplet with SELinux enforcing, which came with `cockpit.socket` already on 9090, the circuit moved Cockpit to port 9443 with a certificate under `/etc/letsencrypt/live`, `cockpit-podman` and `cockpit-selinux`. A test user logged in, Cockpit served the certificate, and after replacing it, `systemctl try-restart cockpit` served the new one. On an Ubuntu 24.04 droplet, Cockpit and `cockpit-podman` came from `noble-backports` and a test user logged in. Both came back after a reboot with no changes in the next plan, and the Rocky Linux audit log had no denials.

A loopback address with `behind_proxy`, `allow_unencrypted` and `root_login` was tried in a Fedora 45 container: Cockpit listened on `127.0.0.1` only, answered plain HTTP, and let root log in. Setting them back put Cockpit on 9090 with its self-signed certificate and turned root away again.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-cockpit/blob/v0.1.0/LICENSE). Cockpit itself is LGPL-2.1-or-later.

## Source

- Repository: [conn3xorg/circuit-cockpit](https://github.com/conn3xorg/circuit-cockpit). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-cockpit/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-cockpit/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-cockpit/tree/v0.1.0/examples/local).
- Related circuits: [Firewall](/circuits/firewall), [fail2ban](/circuits/fail2ban), [certbot](/circuits/certbot), [Apache httpd](/circuits/apache), [Proxmox VE](/circuits/proxmox), [Forgejo](/circuits/forgejo), [GitLab CE](/circuits/gitlab).
