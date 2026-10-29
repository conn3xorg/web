---
title: nginx
description: "Installs nginx, writes your site, keeps the service running and opens port 80 in firewalld or ufw."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-nginx at v0.1.0. -->

A [Conn3x](https://conn3x.org) circuit that installs nginx and serves one page from `/var/www/html`. It keeps the service running and enabled at boot, and reloads nginx when its configuration changes. It also opens the port in the host's firewall, with firewalld or ufw.

## Usage

```hcl
module "web" {
  source = "github.com/conn3xorg/circuit-nginx?ref=v0.1.0"

  hosts = {
    web1 = "203.0.113.10"
    web2 = "203.0.113.11"
  }

  ssh_private_key_file = "~/.ssh/id_ed25519"
  index_html           = file("${path.module}/index.html")
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.` To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-nginx/tree/v0.1.0/examples/local).

### Hosts with pinned host keys

A value in `hosts` can also be a host object, as in a circuit's own [`hosts`](/reference/circuits/hosts#host-object-fields). Use this to hand over servers created in the same plan, with the host key you gave them:

```hcl
module "web" {
  source = "github.com/conn3xorg/circuit-nginx?ref=v0.1.0"

  hosts = {
    for name, d in digitalocean_droplet.web : name => {
      address  = d.ipv4_address
      host_key = tls_private_key.host[name].public_key_openssh
    }
  }
}
```

A host object can set `address`, `user`, `port`, `private_key_file`, `host_key` and `jump_hosts`, and one map can mix addresses and host objects.

## What it does

On every host in `hosts`, in this order:

1. Installs the `nginx` package with dnf or apt.
2. On Debian and Ubuntu, removes the packaged default site from `/etc/nginx/sites-enabled`, since it also claims port 80.
3. Writes `index_html` to `/var/www/html/index.html`.
4. Writes `/etc/nginx/conf.d/circuit-nginx.conf`, a default server on `port` that serves `/var/www/html`.
5. Starts nginx and enables it at boot.
6. Opens `port` in the firewall, as `firewall` says.
7. Reloads nginx if step 2 or 4 changed anything.

### The firewall

| `firewall` | What happens |
| --- | --- |
| `"auto"` (default) | If firewalld is running, the port is opened in its default zone. If not, and ufw is installed, a ufw rule allows the port. On a host with neither, nothing changes. |
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

On SELinux hosts, nginx can only listen on ports labelled `http_port_t`, such as 80, 443, 8008 and 8443. To use another port, label it first with `semanage port`.

## Outputs

None.

## Requirements

- Conn3x v0.6.4 or later.
- Hosts running Rocky Linux, RHEL, AlmaLinux, Fedora, Debian or Ubuntu, with systemd.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-nginx/tree/v0.1.0/examples/local) to each on amd64 and checks that the second plan has no changes.

## License

[MPL-2.0](https://github.com/conn3xorg/circuit-nginx/blob/v0.1.0/LICENSE)

## Source

- Repository: [conn3xorg/circuit-nginx](https://github.com/conn3xorg/circuit-nginx). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-nginx/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-nginx/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-nginx/tree/v0.1.0/examples/local).
- Related circuits: [Apache httpd](/circuits/apache), [Caddy](/circuits/caddy), [HAProxy](/circuits/haproxy), [Traefik](/circuits/traefik), [certbot](/circuits/certbot).
