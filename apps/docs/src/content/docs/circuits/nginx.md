---
title: nginx
description: "Installs nginx, writes your site, keeps it running, opens the firewall, and can serve HTTPS with a self-signed certificate."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-nginx at v0.3.0. -->

[![Conn3x grade](https://conn3x.org/circuits/nginx/grade.svg)](https://conn3x.org/circuits/nginx/grade)

A [Conn3x](https://conn3x.org) circuit that installs nginx and serves one page from `/var/www/html`. It keeps the service running and enabled at boot, and reloads nginx when its configuration changes. It also opens the port in the host's firewall, with firewalld or ufw. Turn on `tls_self_signed` and it serves the site over HTTPS too, with a certificate each host makes for itself.

## Usage

```hcl
module "web" {
  source = "github.com/conn3xorg/circuit-nginx?ref=v0.3.0"

  hosts = {
    web1 = "203.0.113.10"
    web2 = "203.0.113.11"
  }

  ssh_private_key_file = "~/.ssh/id_ed25519"
  index_html           = file("${path.module}/index.html")
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.` To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-nginx/tree/v0.3.0/examples/local).

### Hosts with pinned host keys

A value in `hosts` can also be a host object, as in a circuit's own [`hosts`](/reference/circuits/hosts#host-object-fields). Use this to hand over servers created in the same plan, with the host key you gave them:

```hcl
module "web" {
  source = "github.com/conn3xorg/circuit-nginx?ref=v0.3.0"

  hosts = {
    for name, d in digitalocean_droplet.web : name => {
      address  = d.ipv4_address
      host_key = tls_private_key.host[name].public_key_openssh
    }
  }
}
```

A host object can set `address`, `user`, `port`, `private_key_file`, `host_key` and `jump_hosts`, and one map can mix addresses and host objects.

### HTTPS with a self-signed certificate

No CA yet? A lab, or an internal service nobody outside will visit, can still get HTTPS:

```hcl
module "web" {
  source = "github.com/conn3xorg/circuit-nginx?ref=v0.3.0"

  hosts                = { web1 = "10.0.0.21" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  tls_self_signed = true
  tls_names       = ["web1.lab.example", "10.0.0.21"]
}
```

Each host makes its own key with its own `openssl`, so the private key never leaves the host and never lands in state. The certificate is valid for `tls_days`, 365 by default, and the first plan with 30 days or fewer left makes a new one and reloads nginx. Names in `tls_names` go in as DNS names and addresses as IP addresses; the first is the common name. Leave it empty and the certificate is for the host's name in `hosts`.

Browsers and `curl` won't trust it until you tell them to, which is the point of a CA. For anything the public reaches, use [circuit-certbot](/circuits/certbot) instead.

## What it does

On every host in `hosts`, in this order:

1. Installs the `nginx` package with dnf or apt.
2. On Debian and Ubuntu, removes the packaged default site from `/etc/nginx/sites-enabled`, since it also claims port 80.
3. With `tls_self_signed`, installs `openssl`, makes a key at `/etc/nginx/circuit-nginx.key`, readable by root only, and a self-signed certificate for it at `/etc/nginx/circuit-nginx.crt`.
4. Writes `index_html` to `/var/www/html/index.html`.
5. Writes `/etc/nginx/conf.d/circuit-nginx.conf`, a default server on `port` that serves `/var/www/html`, and with `tls_self_signed` a second one on `tls_port` with that certificate, testing it with `nginx -t` alongside the rest of the config before it replaces the old one. A site nginx rejects, such as one that clashes with another `default_server` on the same port, never replaces the old one: the apply fails, and a restart or a reboot still reads the last good config.
6. Starts nginx and enables it at boot.
7. Opens `port`, and `tls_port` with `tls_self_signed`, in the firewall, as `firewall` says.
8. Reloads nginx if step 2, 3 or 5 changed anything, so a renewed certificate is served straight away.

### The firewall

| `firewall` | What happens |
| --- | --- |
| `"auto"` (default) | If firewalld is running, the port is opened in its default zone. If not, and ufw is installed, a ufw rule allows the port. If another circuit, such as circuit-firewall, is still installing ufw, or has installed firewalld and not started it yet, it waits up to five minutes for that to finish. A firewalld that was stopped on purpose isn't waited for. On a host with neither, nothing changes. |
| `"firewalld"` | Installs firewalld, starts and enables it, and opens the port. firewalld's default zone allows SSH. |
| `"ufw"` | Installs ufw and adds a rule that allows the port. Conn3x doesn't enable ufw; the rule takes effect once you do. |
| `"none"` | Leaves the firewall alone. |

With `"firewalld"` and `"ufw"`, changing the port or switching to another setting closes the old port again. `"auto"` opens the port with a command, so it leaves an old port open when you change it.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | map | Required | The hosts to configure. Each key is a host's name. Each value is its address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. |
| `ssh_user` | string | `"root"` | The user to log in as. |
| `ssh_port` | number | `22` | The SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key file. When null, Conn3x uses the keys in the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | The known_hosts file to check host keys against. When null, Conn3x uses `~/.ssh/known_hosts`. Ignored for hosts with a `host_key`. |
| `ssh_become` | bool | `false` | Run every command as root through sudo. Set this when `ssh_user` isn't root. |
| `index_html` | string | A short "It works" page | Content of `/var/www/html/index.html`. |
| `port` | number | `80` | The port nginx listens on, for IPv4 and IPv6, and the port the firewall opens. |
| `firewall` | string | `"auto"` | `"auto"`, `"firewalld"`, `"ufw"` or `"none"`. See [The firewall](#the-firewall). |
| `tls_self_signed` | bool | `false` | Make a key and a self-signed certificate on each host, and serve the site over HTTPS on `tls_port` as well. See [HTTPS with a self-signed certificate](#https-with-a-self-signed-certificate). |
| `tls_port` | number | `443` | The HTTPS port, opened in the firewall like `port`. Must differ from `port`. |
| `tls_names` | list of string | `[]` | Host names and addresses the certificate is for. The first is its common name. When empty, it's for the host's name in `hosts`. |
| `tls_days` | number | `365` | How long each certificate is valid, from 31 to 3650 days. |

On SELinux hosts, nginx can only listen on ports labelled `http_port_t`, such as 80, 443, 8008 and 8443. To use another port, label it first with `semanage port`.

## Outputs

None.

## Requirements

- Conn3x v0.15.0 or later, for the TLS steps. v0.2.1 of this circuit works with v0.7.0 and later.
- Hosts running Rocky Linux, RHEL, AlmaLinux, Fedora, Debian or Ubuntu, with systemd.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-nginx/tree/v0.3.0/examples/local) to each on amd64, with `tls_self_signed` on, checks that the second plan has no changes, and fetches the page from outside the host over HTTP and HTTPS, before and after restarting nginx.

It was also applied by hand, with six other circuits, to an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing. On both, the page answered on port 80 from outside, through circuit-firewall. After a reboot it answered again, the plan had no changes and the audit log had no SELinux denials. The same checks passed on Fedora 44, with SELinux enforcing, and Debian 13 droplets, before and after a reboot.

## License

[MPL-2.0](https://github.com/conn3xorg/circuit-nginx/blob/v0.3.0/LICENSE)

## Source

- Repository: [conn3xorg/circuit-nginx](https://github.com/conn3xorg/circuit-nginx). This page covers [v0.3.0](https://github.com/conn3xorg/circuit-nginx/tree/v0.3.0); the repository's [tags](https://github.com/conn3xorg/circuit-nginx/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-nginx/tree/v0.3.0/examples/local).
- Related circuits: [certbot](/circuits/certbot), [Apache httpd](/circuits/apache), [Caddy](/circuits/caddy), [HAProxy](/circuits/haproxy), [Traefik](/circuits/traefik), [IIS](/circuits/iis).
