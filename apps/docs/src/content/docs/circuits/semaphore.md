---
title: Semaphore UI
description: "Semaphore UI under Podman: run Ansible, OpenTofu and Terraform from a web page, on SQLite or PostgreSQL."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-semaphore at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/semaphore/grade.svg)](https://conn3x.org/circuits/semaphore/grade)

A Conn3x circuit that runs [Semaphore UI](https://semaphoreui.com) on your own hosts: a web UI for running Ansible playbooks and OpenTofu or Terraform code. Your team keeps the repositories, inventories and keys in one place, runs a task with a button or on a schedule, and everyone can see who ran what, and what it printed.

Semaphore runs from its official image under Podman as a systemd service, pinned by tag and digest. The image carries Ansible, OpenTofu and Terraform, so the host needs none of them. Semaphore listens on `127.0.0.1:3000` for a reverse proxy in front, and keeps its data in SQLite under `/var/lib/semaphore` unless you point it at PostgreSQL, such as one from [circuit-postgres](/circuits/postgres). The first apply creates the admin account, so nobody else can claim the instance before you open it. It runs on Debian, Ubuntu, Fedora and Rocky Linux.

> **Back up `/var/lib/semaphore/config/config.json`.** On its first start, Semaphore generates the key it encrypts every stored SSH key, password and token with, `access_key_encryption`, along with its cookie secrets, and writes them to that file on the host. They never pass through Conn3x, so they're not in your plan, your state or your CI logs. That also means Conn3x can't give them back. Lose the file, and every key in a database backup is unreadable.

## Usage

```hcl
variable "semaphore_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "semaphore" {
  source = "github.com/conn3xorg/circuit-semaphore?ref=v0.1.0"

  hosts                = { ops = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  public_url     = "https://semaphore.example.com"
  admin          = { email = "you@example.com" }
  admin_password = var.semaphore_password
}
```

Then run `conn3x init` and `conn3x apply` with the password in the environment:

```sh
export TF_VAR_semaphore_password='...'
conn3x apply
```

A second `conn3x plan` says `No changes.` Every plan needs the password too, since Conn3x checks the file it's kept in on the host against it. Sign in as `admin`, or the `login` you gave in `admin`.

Semaphore reads the admin and the database settings on its first start only. Changing `admin` or `admin_password` later doesn't change the account; do that in Semaphore.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-semaphore/tree/v0.1.0/examples/local).

### Behind a reverse proxy

Semaphore speaks plain HTTP. Put a proxy in front for TLS, such as [circuit-caddy](/circuits/caddy) on the same host:

```hcl
module "caddy" {
  source = "github.com/conn3xorg/circuit-caddy?ref=v0.3.0"

  hosts                = { ops = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  sites = {
    "semaphore.example.com" = { reverse_proxy = ["127.0.0.1:3000"] }
  }
}
```

`public_url` sets `SEMAPHORE_WEB_ROOT`, which Semaphore puts in the links it sends in alerts. Without a proxy, reach it over SSH: `ssh -L 3000:127.0.0.1:3000 root@192.168.1.50`, then open `http://localhost:3000`.

### With PostgreSQL

SQLite suits a small team. For more, keep Semaphore's data in PostgreSQL:

```hcl
variable "db_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "postgres" {
  source = "github.com/conn3xorg/circuit-postgres?ref=v0.3.0"

  hosts                = { ops = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  users          = ["semaphore"]
  user_passwords = { semaphore = var.db_password }
  databases      = { semaphore = "semaphore" }
}

module "semaphore" {
  source = "github.com/conn3xorg/circuit-semaphore?ref=v0.1.0"

  depends_on = [module.postgres]

  hosts                = { ops = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  admin             = { email = "you@example.com" }
  admin_password    = var.semaphore_password
  postgres          = {}
  postgres_password = var.db_password
}
```

`postgres = {}` means the defaults: `127.0.0.1:5432`, database and user `semaphore`. Semaphore runs on the host's network, so it reaches a PostgreSQL that listens only on localhost. The password reaches it in a root-only env file, written from the ephemeral value. Semaphore's own setup also copies it into `config.json`, which is on the host, in a directory only root can enter.

Semaphore picks its database on its first start, when it writes `config.json`. Setting `postgres` on an instance that started on SQLite doesn't move it.

## Reaching your hosts from Semaphore

Tasks run inside Semaphore's container, as its `semaphore` user, on the host's network. So a playbook reaches your other hosts the way the Semaphore host does. Give Semaphore an SSH key under **Key Store** and point an inventory at the hosts, as you would for any Ansible control node.

Repositories can be Git URLs, which Semaphore clones into its container, or a path inside the container. `/var/lib/semaphore` in the container is `/var/lib/semaphore/data` on the host, so a directory you put there, such as `/var/lib/semaphore/data/playbooks`, is the repository `/var/lib/semaphore/playbooks` in Semaphore. That's what CI does.

## What it does

On each host, in order:

1. Creates `/var/lib/semaphore`, mode `0700`, with `config` and `data` in it.
2. Through [circuit-podman](/circuits/podman) v0.1.0, installs Podman and runs `docker.io/semaphoreui/semaphore:VERSION@DIGEST` as `semaphore.service`: a Quadlet unit on the host's network that mounts `config` as `/etc/semaphore` and `data` as `/var/lib/semaphore`. `admin_password`, `postgres_password` and `environment` go to `/etc/containers/env/semaphore.env`, mode `0600`, written from ephemeral values so they never reach the plan or state.
3. Waits up to 10 minutes for Semaphore to open its port, on the first apply and again after any change that restarts it.

On the first start, the image's own start script runs `semaphore setup`, which writes `config.json` with freshly generated `cookie_hash`, `cookie_encryption` and `access_key_encryption`, creates the database, and creates the admin. On later starts it finds `config.json` and goes straight to the server.

The unit sets `SEMAPHORE_INTERFACE` and `SEMAPHORE_PORT` from `listen_address` and `port`, the `SEMAPHORE_DB_*` variables from `postgres` (or SQLite at `/var/lib/semaphore/database.sqlite`), `SEMAPHORE_ADMIN`, `SEMAPHORE_ADMIN_NAME` and `SEMAPHORE_ADMIN_EMAIL` from `admin`, and `SEMAPHORE_WEB_ROOT` from `public_url`. A change to any input restarts Semaphore, and tasks running at that moment are cut off.

### Who owns the data

Semaphore runs in the container as UID 1001, and Podman hands `config` and `data` to that UID each time the container starts. On a host where UID 1001 is a person's account, that account owns Semaphore's files on paper, but can't reach them: only root can enter `/var/lib/semaphore`.

### Upgrades

Change `semaphore_version` and `image_digest` together. `conn3x plan` shows the new image in the unit, the apply restarts Semaphore on it, and Semaphore migrates its database as it starts. CI applies v2.19.16 first, runs a task, then upgrades to v2.19.17 and runs another. Semaphore publishes release candidates and betas under the same image name; pin a release.

### What it doesn't do

- It doesn't set up TLS or a reverse proxy.
- It doesn't open a port in a firewall.
- It doesn't run Semaphore's separate runners, or Semaphore Pro.
- It doesn't add Python packages for your playbooks. The image installs a `requirements.txt` from `/var/lib/semaphore/config` on start, if you put one there.
- It doesn't back anything up. Back up `/var/lib/semaphore` or PostgreSQL (see [circuit-restic](/circuits/restic)), and `config.json` with it.
- Deleting the module leaves Podman, the container and `/var/lib/semaphore` in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.50"`, or a host object such as `{ address = "192.168.1.50", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `admin` | object | Required | The admin created on the first start: `email`, and optionally `login` (`"admin"`) and `name` (`"Semaphore Admin"`). |
| `admin_password` | string, sensitive, ephemeral | Required | The admin's first password, at least 8 characters. Ephemeral and sensitive: it reaches a root-only file on the host but never the plan or state. |
| `public_url` | string | `null` | The address people reach Semaphore at, such as `"https://semaphore.example.com"`. Sets `SEMAPHORE_WEB_ROOT`. |
| `postgres` | object | `null` | PostgreSQL to keep Semaphore's data in: `host` (`"127.0.0.1"`), `port` (`5432`), `database` (`"semaphore"`) and `username` (`"semaphore"`). The role and database must exist. When null, Semaphore uses SQLite. |
| `postgres_password` | string, sensitive, ephemeral | `null` | Password of the PostgreSQL user. Needed with `postgres`. Ephemeral and sensitive, like `admin_password`. |
| `listen_address` | string | `"127.0.0.1"` | Address Semaphore listens on. |
| `port` | number | `3000` | Port Semaphore listens on. |
| `environment` | map(string), sensitive, ephemeral | `{}` | More of Semaphore's [environment variables](https://docs.semaphoreui.com/administration-guide/configuration), such as `SEMAPHORE_EMAIL_ALERT` or `SEMAPHORE_EMAIL_PASSWORD`. Ephemeral and sensitive: they go into the root-only env file and never the plan or state. The database, admin, listen and URL variables aren't allowed here. |
| `semaphore_version` | string | `"v2.19.17"` | Tag of Semaphore's image. Change `image_digest` with it. |
| `image_digest` | string | `"sha256:008dacd9..."` | Digest of the image for `semaphore_version`. Find it on [Docker Hub](https://hub.docker.com/r/semaphoreui/semaphore/tags). |

## Outputs

| Name | Description |
| --- | --- |
| `service` | `semaphore.service`. |
| `image` | The image the hosts run, with its tag and digest. |
| `url` | Where Semaphore answers on the host, such as `http://127.0.0.1:3000`. Point a reverse proxy here. |
| `config_file` | `/var/lib/semaphore/config/config.json`, the file to back up. |

## Requirements

Requires Conn3x v0.7.0 or later and systemd on each host. The image is built for amd64 and arm64. Each host needs to reach its package mirror and Docker Hub. `conn3x init` fetches circuit-podman from GitHub.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-semaphore/tree/v0.1.0/examples/local) to each on amd64, with SQLite, starting on v2.19.16 and then upgrading to v2.19.17, and checks that the next plan has no changes. Through an SSH tunnel, the check sees a wrong password refused, signs in as the admin, makes an API token, and sets up a project with a local repository, an inventory of localhost and a template. It runs the template as a task and finds the playbook's message in Ansible's output. It does that on both versions and after CI restarts the host. The admin password and the secrets Semaphore generated aren't in state.

By hand, on two DigitalOcean droplets with 2 GB of memory, Ubuntu 24.04 and Rocky Linux 10 with SELinux enforcing, each running this circuit next to circuit-portainer and circuit-passbolt: the same upgrade from v2.19.16, the same checks, and a reboot after which Semaphore came back on its own, ran the task again and planned clean. The Rocky audit log had no SELinux denials, and no secret was in state. PostgreSQL hasn't been tried yet; every run used SQLite.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-semaphore/blob/v0.1.0/LICENSE).

Semaphore UI is under the [MIT licence](https://github.com/semaphoreui/semaphore/blob/develop/LICENSE).

## Source

- Repository: [conn3xorg/circuit-semaphore](https://github.com/conn3xorg/circuit-semaphore). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-semaphore/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-semaphore/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-semaphore/tree/v0.1.0/examples/local).
- Related circuits: [PostgreSQL](/circuits/postgres), [Caddy](/circuits/caddy), [Podman](/circuits/podman), [restic](/circuits/restic), [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [k6](/circuits/k6), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Python](/circuits/python), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain), [Renovate](/circuits/renovate).
