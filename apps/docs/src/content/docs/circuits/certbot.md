---
title: certbot
description: "Let's Encrypt certificates with certbot for nginx, HAProxy and the rest, renewed by the distro's own timer."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-certbot at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/certbot/grade.svg)](https://conn3x.org/circuits/certbot/grade)

A Conn3x circuit that gets TLS certificates from Let's Encrypt with certbot, and keeps them renewed. You list the certificates you want and the domains on each, and every host ends up with them under `/etc/letsencrypt/live`, a renewal timer that's switched on, and, if you give one, a command that runs whenever a certificate changes, such as `systemctl reload nginx`.

It's for nginx, HAProxy, Postfix, or anything else that reads a certificate from disk. If you run Caddy, you don't need this: Caddy gets and renews its own certificates, so [circuit-caddy](/circuits/caddy) covers it.

## Usage

```hcl
module "certbot" {
  source = "github.com/conn3xorg/circuit-certbot?ref=v0.1.0"

  hosts                = { web1 = "203.0.113.10" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  email   = "admin@example.com"
  staging = true

  certs = {
    example = ["example.com", "www.example.com"]
  }
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

Start with `staging = true`. Let's Encrypt's staging server works the same way, but its certificates aren't trusted by browsers and its rate limits are far higher, so a typo in a domain or a closed port 80 costs you nothing. The production server allows five certificates for the same set of domains a week, and five failed checks an hour for the same domain. Once staging gives you a certificate, set `staging = false` and apply again: the circuit sees the certificate came from the wrong server and replaces it.

Every domain has to point at the host already, and port 80 on the host has to be reachable from the internet, since Let's Encrypt checks each domain over plain HTTP. Wildcard certificates need a DNS challenge, which this circuit doesn't do.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-certbot/tree/v0.1.0/examples/local). It runs against Pebble, a test ACME server, since a container can't get a real certificate.

### Choosing a method

`method` decides how certbot answers Let's Encrypt's challenge on port 80.

| `method` | When to use it |
| --- | --- |
| `"standalone"` (default) | Nothing else listens on port 80. certbot runs its own small web server for the few seconds the challenge takes, at issue and at each renewal. HAProxy or a mail server that doesn't use port 80 fits here. |
| `"webroot"` | A web server already serves port 80. certbot writes the challenge file under `webroot_path`, and your server has to serve that directory at `/.well-known/acme-challenge/`. |
| `"nginx"` | nginx serves port 80. certbot's nginx plugin adds the challenge to nginx's configuration for the moment it needs it, then puts it back. It doesn't change your sites. |

With nginx from [circuit-nginx](/circuits/nginx), either `"nginx"` or `"webroot"` with the default `/var/www/html` works. Put the certbot module after it with `depends_on`, so nginx is running first, and give each host's `os` so the plan can work out the packages before the hosts are read:

```hcl
module "web" {
  source = "github.com/conn3xorg/circuit-nginx?ref=v0.1.0"
  hosts  = { web1 = "203.0.113.10" }
}

module "certbot" {
  source     = "github.com/conn3xorg/circuit-certbot?ref=v0.1.0"
  depends_on = [module.web]

  hosts       = { web1 = { address = "203.0.113.10", os = "ubuntu" } }
  method      = "nginx"
  certs       = { example = ["example.com"] }
  deploy_hook = "systemctl reload nginx"
}
```

Using the certificate is up to you. Point your server at the paths in the `certificates` output, `fullchain` and `privkey`.

### The deploy hook

`deploy_hook` is a shell command, written to `/etc/letsencrypt/renewal-hooks/deploy/conn3x`. certbot runs it after each renewal, and the circuit runs it after it first gets or replaces a certificate, so your server picks up the new files either way. It gets the same variables certbot sets: `RENEWED_LINEAGE`, the certificate's directory under `live`, and `RENEWED_DOMAINS`, its domains separated by spaces.

### Hosts created in the same plan

Pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry, and with the distribution in `os`. The circuit picks packages and the timer's name by distribution, and Conn3x can't ask a host that doesn't exist yet. If `os` turns out not to match, Conn3x stops before configuring the host. Set `os` as well when you put `depends_on` on this module, as above.

```hcl
hosts = {
  for name, d in digitalocean_droplet.web : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
    os       = "ubuntu"
  }
}
```

## What it does

On each host, in order:

1. On Rocky Linux and AlmaLinux, installs `epel-release` from the distribution's extras repository, which turns on EPEL, where certbot comes from on the Red Hat family. EPEL stays on afterwards. RHEL doesn't ship `epel-release`, so on RHEL turn EPEL on yourself first.
2. Installs `certbot` and `openssl` from the distribution, and `python3-certbot-nginx` when `method` is `"nginx"`.
3. Writes the deploy hook, if you set one.
4. For each certificate, runs `certbot certonly` unless `/etc/letsencrypt/live/<name>/cert.pem` already covers exactly these domains and its renewal file names the same server and method. Then runs the deploy hook.
5. Starts and enables the renewal timer: `certbot.timer` on Debian and Ubuntu, `certbot-renew.timer` on Fedora, Rocky Linux and AlmaLinux, which ship it switched off. It runs `certbot renew` twice a day, which renews each certificate when it gets close to expiring.

Adding or removing a domain, switching `staging`, changing `acme_server` or changing `method` gets a new certificate on the next apply, under the same name, and counts against Let's Encrypt's limits like any other. Changing `email` or `webroot_path` alone doesn't, since the certificate is still good; they apply the next time a certificate is issued.

### Why the distribution's certbot

certbot's own instructions point to the snap. The circuit uses the distribution's package instead, on every distribution, because it's the route that's the same everywhere: there's no snapd on Fedora or Rocky Linux, or in a container, and the packages come with a renewal timer and security updates through your normal upgrades. At the time of writing that's certbot 2.9 on Ubuntu 24.04, 4.0 on Debian 13, 4.2 from EPEL on Rocky Linux 10 and 5.8 on Fedora 45. All of them talk to Let's Encrypt the same way for what this circuit asks of them. The version is whatever your distribution ships, so there's no version input.

### What it doesn't do

- It doesn't configure TLS in your web server. Point it at the `certificates` paths yourself.
- It doesn't open port 80 in the firewall. [circuit-firewall](/circuits/firewall) can; circuit-nginx opens it for you.
- It doesn't do DNS challenges, so no wildcard certificates.
- With `"standalone"`, renewal needs port 80 free. If you later put a web server on it, switch `method`.
- Deleting a certificate from `certs` leaves it on the host and certbot keeps renewing it. Run `certbot delete --cert-name <name>` to stop that. Deleting the module leaves certbot installed and the timer on.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`, the distribution's ID, such as `ubuntu` or `rocky`. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `certs` | map(list(string)) | Required | Certificates by name, each with its domains, such as `{ example = ["example.com", "www.example.com"] }`. The name is the directory under `/etc/letsencrypt/live`. Every host gets every certificate. |
| `email` | string | `null` | Email address for the ACME account. When null, the account is registered without one. |
| `method` | string | `"standalone"` | `"standalone"`, `"webroot"` or `"nginx"`. See [Choosing a method](#choosing-a-method). |
| `webroot_path` | string | `"/var/www/html"` | Directory your web server serves on port 80, for `"webroot"`. |
| `staging` | bool | `false` | Use Let's Encrypt's staging server. Try it first. |
| `acme_server` | string | `null` | ACME directory URL of another certificate authority. When null, Let's Encrypt. Can't be set with `staging`. |
| `deploy_hook` | string | `null` | Shell command to run after a certificate is issued or renewed, such as `"systemctl reload nginx"`. |

## Outputs

| Name | Description |
| --- | --- |
| `certificates` | Paths on each host, by certificate name: `fullchain`, `privkey`, `cert` and `chain`, such as `/etc/letsencrypt/live/example/fullchain.pem`. |
| `acme_server` | ACME directory URL the certificates come from. |

## Requirements

Requires Conn3x v0.6.5 or later and systemd on each host, with a package mirror the host can reach. On Rocky Linux and AlmaLinux, the host also needs to reach EPEL's mirrors; on RHEL, EPEL must already be on. Let's Encrypt has to reach each domain on port 80.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-certbot/tree/v0.1.0/examples/local) to each on amd64 against Pebble, Let's Encrypt's test server, checks that the second plan has no changes, checks the certificate has the example's domains, that the deploy hook ran and the renewal timer is on, and runs `certbot renew --dry-run`. On Rocky Linux 10, the `"nginx"` method with circuit-nginx was also tried against Pebble, then switched to `"webroot"`, which replaced the certificate and again left no changes.

Against Let's Encrypt's staging server, on `s-1vcpu-1gb` droplets with sslip.io names: Ubuntu 24.04 with `"standalone"`, and Rocky Linux 10 with SELinux enforcing, `"nginx"` and circuit-nginx v0.1.0. Both got their certificates, planned with no changes, passed `certbot renew --dry-run`, and had their timers running and no changes to plan after a reboot. The Rocky Linux host's audit log had no denials. Production Let's Encrypt wasn't used in testing.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-certbot/blob/v0.1.0/LICENSE). certbot itself is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-certbot](https://github.com/conn3xorg/circuit-certbot). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-certbot/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-certbot/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-certbot/tree/v0.1.0/examples/local).
- Related circuits: [Caddy](/circuits/caddy), [nginx](/circuits/nginx), [Firewall](/circuits/firewall), [Apache httpd](/circuits/apache), [HAProxy](/circuits/haproxy), [Traefik](/circuits/traefik).
