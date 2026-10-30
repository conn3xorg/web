---
title: "Pick the parts, get a config you can run"
description: "The Circuit Builder at conn3x.org/build turns a distribution and a handful of circuits into a main.tf, a README and, when there are secrets, a variables.tf. It greys out what can't work together, keeps passwords out of the file, and runs in your browser."
date: 2026-11-06
author: James Conway
image: /media/blog/circuit-builder/card.png
imageAlt: "Pick the parts. Get a config you can run. Rocky Linux 10 with nginx, docker, fail2ban and firewall picked, apache greyed out because both want ports 80 and 443, and the main.tf module block it writes for nginx."
---

Say you want nginx, Docker, fail2ban and a firewall on two Rocky Linux boxes. Every one of those is a circuit already, tested on real hosts. What stands between you and `conn3x apply` is a blank `main.tf`.

So you open four READMEs. You copy four module blocks and pin four release tags. You work out which inputs are required and which have sensible defaults, and then you remember the firewall needs to be told about port 80, or nginx will sit there serving nobody. None of it is hard. All of it is fiddly, and fiddly is where a typo in a version tag eats your evening.

That's the job the [Circuit Builder](/build) does. You pick a distribution and the circuits you want, fill in the few values they can't guess, and it writes the config. It doesn't touch a server. It writes files you read, keep and run yourself.

<figure>
  <video src="/media/blog/circuit-builder/build.mp4" poster="/media/blog/circuit-builder/build.webp" width="1280" height="720" controls muted loop playsinline preload="metadata" aria-label="The Circuit Builder in a browser: Rocky Linux 10 is picked, then nginx, which greys out apache, caddy, haproxy and traefik with the reason. Docker, fail2ban and firewall are picked, which greys out keepalived. Two hosts, an SSH user and a key are typed in, Write my config is pressed, and the main.tf and README.md it wrote are shown."></video>
  <figcaption>Rocky Linux 10, nginx, docker, fail2ban and firewall, from first click to main.tf.</figcaption>
</figure>

## Three steps, then your files

<figure>
  <a href="/media/blog/circuit-builder/flow.png">
    <img src="/media/blog/circuit-builder/flow.png" width="1600" height="1102" loading="lazy" decoding="async" alt="Three steps to a config. Step 1, distribution: Rocky Linux 10, Fedora 45, Ubuntu 24.04 or Debian 13. Step 2, circuits: 56 circuits in 14 categories, where picking one greys out whatever clashes with it. Step 3, settings: hosts, SSH user and key, and only the inputs each circuit needs. Out come main.tf, variables.tf for secrets, README.md with run steps, and a zip of all of it. Written in your browser; nothing you type leaves it." />
  </a>
</figure>

<details>
<summary>Read the diagram as text</summary>

- **Distribution:** Rocky Linux 10, Fedora 45, Ubuntu 24.04 or Debian 13. Circuits that aren't tested on it grey out, with the reason.
- **Circuits:** 56 of them, grouped by the same 14 categories as the [circuit directory](/circuits). Picking one greys out anything that clashes with it.
- **Settings:** your hosts, one per line, the SSH user, key and `known_hosts` file, and whether to use sudo. Then only the inputs each circuit can't do without. The rest sit under "More settings" with the circuit's own defaults showing.
- **Your files:** `main.tf`, a `variables.tf` when there are secrets, and a `README.md` with the run steps. Copy them one at a time or download `conn3x-config.zip`.

</details>

The distribution comes first because everything else depends on it. A circuit is offered only on the distributions its own CI tests it on, so on Rocky Linux 10 you'll find Zeek greyed out with "Not tested on Rocky Linux 10 yet." It isn't hidden. You can see it's there and why you can't have it today.

Then the circuits, and this is where the builder earns its keep.

## What it won't let you do

<figure>
  <a href="/media/blog/circuit-builder/safety.png">
    <img src="/media/blog/circuit-builder/safety.png" width="1600" height="1391" loading="lazy" decoding="async" alt="What it won't let you do. Put two things on one port: 80 and 443, DNS on 53, 3000, 8080, 9090, 9100 and 3306. Use a circuit on an untested distro. Type a password into the page: secrets become variables set with TF_VAR_. Forget what a circuit needs: Infisical brings PostgreSQL and Valkey, wired. Open more than you use: the firewall opens only what your picks listen on. Run unpinned or unofficial code: only official circuits, each pinned to its release, with no raw HCL. Checked in CI: 56 circuits alone and 15 combinations run through conn3x validate." />
  </a>
</figure>

<details>
<summary>Read the panel as text</summary>

- **Two things on one port.** Circuits that want the same port can't share a host, so picking one greys out its rivals.
- **A circuit on an untested distribution.** It's offered only where its CI runs.
- **A password typed into the page.** Secrets become variables in `variables.tf`, set with `TF_VAR_...` in your shell.
- **A missing dependency.** Infisical brings PostgreSQL and Valkey along, wired the way its README shows.
- **More open ports than you use.** The firewall opens what your picks listen on, and LAN-only ports open only to a network you name.
- **Unpinned or unofficial code.** Only official circuits, each pinned to its release, and no raw HCL.

</details>

Pick nginx and four chips fade: Apache, Caddy, HAProxy and Traefik. Under them, one line each says why: "Can't go with nginx: both want ports 80 and 443." Pi-hole and GitLab grey out too, since both want 80 and 443 for their web pages. The same goes for DNS on 53 (Pi-hole, AdGuard Home, Unbound, BIND), 3000 (Grafana, Forgejo, AdGuard Home's web UI, the monitoring stack), 8080, 9090, 9100 and MySQL's 3306. MySQL and MariaDB clash twice over, because their packages replace each other.

<figure>
  <a href="/media/blog/circuit-builder/picks.png">
    <img src="/media/blog/circuit-builder/picks.png" width="1280" height="900" loading="lazy" decoding="async" alt="The Circuits step on Rocky Linux 10 with nginx, docker, fail2ban and firewall picked. Apache, caddy, haproxy and traefik are greyed out, each with the line: Can't go with nginx: both want ports 80 and 443. Pi-hole is greyed out for the same reason. Keepalived is greyed out with: Can't go with firewall: circuit-firewall has no rule for VRRP, so every host would claim the floating address." />
  </a>
  <figcaption>The real page, with nginx, docker, fail2ban and firewall picked.</figcaption>
</figure>

Not every clash is a port. Pick the firewall and keepalived greys out, because circuit-firewall has no rule for VRRP and every host would claim the floating address. That's the kind of thing you'd find out at 2 a.m., not from a README.

Some circuits need others. Pick Infisical and PostgreSQL and Valkey come along, wired the way Infisical's README shows: a role, a database and its password in PostgreSQL, both connection URLs filled in, and a `depends_on` so they're ready first. The monitoring stack brings Docker for the same reason.

A few circuits aren't in the builder yet, and the page says so with a reason each. k3s, kubeadm and Velociraptor have two kinds of host, servers and the machines that join them, and v1 writes one group. Proxmox turns the host into a hypervisor, and MicroShift takes over the whole box. Their READMEs show how to set them up by hand.

## Secrets stay out of the file

Any input a circuit marks sensitive or ephemeral never becomes a value in `main.tf`. The builder writes a variable for it in `variables.tf`, and `main.tf` points at the variable. Here's what Infisical on Rocky Linux gets:

```hcl
variable "infisical_db_password" {
  type        = string
  description = "db_password for infisical. Set TF_VAR_infisical_db_password; it never goes in a file."
  sensitive   = true
  ephemeral   = true
}
```

The README tells you to set it in your shell before you plan, with `export TF_VAR_infisical_db_password='...'`. There's no field on the page to type it into, so it can't end up in a screenshot, a zip or a commit.

## What comes out

Here's the `main.tf` for the build in the video: Rocky Linux 10, nginx, docker, fail2ban and firewall, on two hosts. It's word for word what the builder wrote, with the docker and fail2ban blocks trimmed because they look like the nginx one.

```hcl
# Written by the Circuit Builder at https://conn3x.org/build for Rocky Linux 10.
# Each circuit is pinned to a release. Read its README before you apply.

locals {
  hosts = {
    web1 = { address = "203.0.113.10", os = "rocky" }
    web2 = { address = "203.0.113.11", os = "rocky" }
  }
}

module "nginx" {
  source = "github.com/conn3xorg/circuit-nginx?ref=v0.1.0"

  hosts                = local.hosts
  ssh_user             = "deploy"
  ssh_private_key_file = "~/.ssh/id_ed25519"
  ssh_become           = true
}

# module "docker" and module "fail2ban" follow, pinned to v0.1.1 and v0.2.0.

module "firewall" {
  source = "github.com/conn3xorg/circuit-firewall?ref=v0.2.0"

  hosts                = local.hosts
  ssh_user             = "deploy"
  ssh_private_key_file = "~/.ssh/id_ed25519"
  ssh_become           = true
  allow = [
    { port = "80/tcp" },
  ]
}
```

Three things are worth a second look. Every `source` is an official circuit pinned to the release in the directory, so the config you run next month is the one you read today. Each host carries `os = "rocky"`, which the circuits check against the real machine before they change anything. And the firewall opens 80/tcp and nothing else, because nginx is the only pick listening beyond loopback. SSH stays open on its own. The README spells it out: "SSH stays open. It also opens 80/tcp (nginx) to everyone."

Ports that belong on your own network get more care. Samba's 445, NFS's 2049, node_exporter's 9100, Cockpit's 9090 and a few more open only to a network you type in, like `192.168.1.0/24`. Leave that empty and they stay closed, and the README says which ones.

<figure>
  <a href="/media/blog/circuit-builder/config.png">
    <img src="/media/blog/circuit-builder/config.png" width="1280" height="838" loading="lazy" decoding="async" alt="The Your config section of the Circuit Builder: tabs for main.tf and README.md, the start of main.tf with the locals block and the nginx and docker modules, and buttons to copy the file or download all as a zip." />
  </a>
</figure>

There's no free-text box that becomes code. Every value you type goes through one function that writes it as an HCL string, number, bool, list or object, with `${` and `%{` escaped. References like `local.hosts` come only from the builder itself. You can't paste a block of HCL into a field and have it land in the file.

## Nothing leaves your browser

The builder is a page and a plain JavaScript module. The circuit data, the inputs and the rules are part of the page, and the files, the zip included, are written right there in your browser. Hostnames, addresses and key paths don't go anywhere. Neither does anything else you type.

## How we know the configs work

A builder that writes broken configs would be worse than no builder. So the site's CI runs the same code the page runs and writes every one of the 56 circuits on its own, plus 15 realistic combinations across the four distributions: Apache, MySQL and Certbot on Ubuntu, Infisical and Caddy on Rocky, the monitoring stack with Samba and NFS on Debian, and this post's nginx build among them. That's 71 configs. Each one goes through `conn3x fmt -check`, then `conn3x init -backend=false` and `conn3x validate`, with the latest Conn3x release, checksum checked.

Validate runs each circuit's own validation rules on the values, so a bad sample value fails the job as surely as bad syntax does. If any one of the 71 fails, the job fails. Unit tests sit underneath: the escaping, including attempts to break out of a string, the type of every input of every circuit, the conflicts, the secrets, the firewall and the zip format, and a check that circuits left out of the builder can't be generated.

What validate can't do is apply. It proves the config is well formed and the values are ones the circuits accept. The circuits themselves are applied to real hosts in their own CI, on the distributions they list.

## What it doesn't do yet

It writes for one group of hosts, all with the same role. Clusters with servers and agents need a second group, and that's not in v1. It doesn't create cloud servers either; you bring the machines. And you can't share a build as a link yet.

Forgejo, Keycloak, Matrix and LLDAP work without a database circuit, on SQLite or a file meant for trials, so the builder doesn't wire PostgreSQL to them. Their hints point at the README, which shows how.

## Try it

Open [conn3x.org/build](/build), pick a distribution and see what greys out. If you're new to Conn3x, the README it writes walks you from `conn3x init` to `conn3x apply`, and the [get started guide](https://docs.conn3x.org/get-started) covers installing it.

If the builder greys out something you think should work together, or writes something you didn't expect, [open a discussion](https://github.com/conn3xorg/conn3x/discussions) and tell us what you picked. The rules live in one file, `builder.json`, so a good report turns into a fix quickly.
