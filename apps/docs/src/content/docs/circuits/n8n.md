---
title: n8n
description: "Self-hosted n8n workflow automation in Podman: SQLite or PostgreSQL, host-generated encryption key, owner account set up on first apply."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-n8n at v0.1.1. -->

[![Conn3x grade](https://conn3x.org/circuits/n8n/grade.svg)](https://conn3x.org/circuits/n8n/grade)

A Conn3x circuit that runs [n8n](https://n8n.io), the workflow automation tool, on your own hosts. You wire up webhooks, schedules and a few hundred services in its editor, and the workflows, the credentials they use and every execution stay on a machine you run.

n8n runs from its official image under Podman as a systemd service, pinned by tag and digest, and listens on `127.0.0.1:5678` for a reverse proxy in front. It keeps its data in SQLite under `/var/lib/n8n` unless you point it at PostgreSQL, such as one from [circuit-postgres](/circuits/postgres). If you give it an owner, the first apply creates that account for you, so nobody else can claim the instance before you open it. It runs on Debian, Ubuntu, Fedora and Rocky Linux.

Telemetry, the personalisation survey and version checks are off. n8n turns all three on by default.

> **Back up `/etc/n8n/keys.env`.** `N8N_ENCRYPTION_KEY` encrypts every credential n8n stores: API keys, OAuth tokens, database passwords. The first apply makes it on the host and it never passes through Conn3x, so it's not in your plan, your state or your CI logs. That also means Conn3x can't give it back to you. Lose it, and every credential in a database backup is unreadable; you'd re-enter each one by hand. Copy the file somewhere safe, away from the database backups, as soon as the first apply finishes.

## Usage

```hcl
variable "owner_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "n8n" {
  source = "github.com/conn3xorg/circuit-n8n?ref=v0.1.1"

  hosts                = { automation = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  public_url     = "https://n8n.example.com"
  owner          = { email = "you@example.com", first_name = "Sam", last_name = "Rivera" }
  owner_password = var.owner_password
}
```

Then run `conn3x init` and `conn3x apply` with the password in the environment:

```sh
export TF_VAR_owner_password='...'
conn3x apply
```

A second `conn3x plan` says `No changes.` Every plan needs the password too, since Conn3x checks the file it's kept in on the host against it. n8n wants 8 to 64 characters, with at least one digit and one uppercase letter, and the circuit checks that before it connects to anything.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-n8n/tree/v0.1.1/examples/local).

### Behind a reverse proxy

n8n speaks plain HTTP on `127.0.0.1:5678`. Put a proxy in front for TLS, such as [circuit-caddy](/circuits/caddy) on the same host:

```hcl
module "caddy" {
  source = "github.com/conn3xorg/circuit-caddy?ref=v0.2.1"

  hosts                = { automation = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  sites = {
    "n8n.example.com" = { reverse_proxy = ["127.0.0.1:5678"] }
  }
}
```

Then set `public_url` to the address people type. n8n can't tell it's behind a proxy, so without it, the webhook URLs it shows in the editor would read `http://localhost:5678/webhook/...`, which nobody outside can call. From `public_url`, the circuit sets:

| Variable | From `https://n8n.example.com` |
| --- | --- |
| `N8N_HOST` | `n8n.example.com` |
| `N8N_PROTOCOL` | `https` |
| `WEBHOOK_URL` | `https://n8n.example.com/` |
| `N8N_EDITOR_BASE_URL` | `https://n8n.example.com/` |
| `N8N_SECURE_COOKIE` | `true`, since the address is HTTPS |

With an `http://` address, or none, `N8N_SECURE_COOKIE` is `false`: browsers only send a secure cookie over HTTPS, and you couldn't sign in otherwise. `N8N_PROXY_HOPS` is `1`, so n8n takes the client's address from the proxy's `X-Forwarded-For`. Set `proxy_hops = 0` if people reach n8n directly.

Without a proxy, you can still reach the editor over SSH: `ssh -L 5678:127.0.0.1:5678 root@192.168.1.50`, then open `http://localhost:5678`.

### With PostgreSQL

SQLite suits one person or a small team. For more, or for workflows that run often, keep n8n's data in PostgreSQL:

```hcl
variable "db_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "postgres" {
  source = "github.com/conn3xorg/circuit-postgres?ref=v0.2.0"

  hosts                = { automation = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  users          = ["n8n"]
  user_passwords = { n8n = var.db_password }
  databases      = { n8n = "n8n" }
}

module "n8n" {
  source = "github.com/conn3xorg/circuit-n8n?ref=v0.1.1"

  depends_on = [module.postgres]

  hosts                = { automation = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  public_url        = "https://n8n.example.com"
  postgres          = {}
  postgres_password = var.db_password
}
```

`postgres = {}` means the defaults: `127.0.0.1:5432`, database and user `n8n`, schema `public`. Give any of `host`, `port`, `database`, `username` and `schema` to change them. The password reaches n8n as `DB_POSTGRESDB_PASSWORD` in a root-only env file, written from the ephemeral value, so it's never in the plan or state.

Switching an existing instance from SQLite to PostgreSQL doesn't move its data. n8n starts on the empty database as a new instance. Export your workflows and credentials first with `n8n export:workflow` and `n8n export:credentials`, inside the container.

### The owner account

n8n's first screen asks for an owner account, and the first person to open the editor gets it. With `owner` and `owner_password` set, the apply creates the owner itself, through n8n's own setup endpoint (`POST /rest/owner/setup`), as soon as n8n is up. It sends the request from inside the container with Node, so the host needs no `curl`, and the password goes in on stdin rather than a command line.

The circuit creates the owner and never changes it afterwards. If n8n already has an owner, the step says so and leaves it alone. Change the owner's name, email or password in n8n's settings; changing `owner` later does nothing to the account.

The password stays on the host in `/etc/n8n/owner_password`, mode `0600`, so that every plan can check it. Once you've changed the password in n8n, that file no longer opens anything.

Leave `owner` out and n8n shows its setup screen the first time you open it. Do that before you put the editor on a public address.

## Why a container

n8n ships as a Docker image and as an npm package. This circuit uses the image:

- **It's what n8n tests.** The image carries the Node.js version n8n is built against, so no host needs its own Node.js, at whatever version its distribution ships.
- **One pin, checked.** `n8n_version` and `image_digest` go into the unit together, and Podman pulls by the digest, so a tag that's re-pushed upstream can't change what your hosts run.
- **Upgrades are a diff.** Change both inputs and `conn3x plan` shows the new image in the unit file. The apply restarts n8n on it, and n8n migrates its database as it starts.

n8n publishes the image to GitHub's registry as `ghcr.io/n8n-io/n8n` and to Docker Hub as `docker.n8n.io/n8nio/n8n`, with the same digest on both. The circuit pulls from GitHub's registry: Docker Hub limits pulls without an account, and that limit stopped test droplets cold. Set `image_repository = "docker.n8n.io/n8nio/n8n"` if you'd rather pull from Docker Hub.

The container uses the host's network rather than a published port, so it reaches a PostgreSQL that listens only on localhost, which is how circuit-postgres starts out, and `listen_address` is a real address on the host.

## What it does

On each host, in order:

1. Creates `/etc/n8n`, mode `0700`, owned by root.
2. If `/etc/n8n/keys.env` doesn't exist, writes it, mode `0600`, with `N8N_ENCRYPTION_KEY`: 24 random bytes from `/dev/urandom` in base64, the same form n8n makes for itself. Once the file exists the circuit never touches it again, so the key can't change under a running instance.
3. Creates `/var/lib/n8n/data`, in a parent only root can enter, for the SQLite database, n8n's own config and its event log.
4. Through [circuit-podman](/circuits/podman) v0.1.0, installs Podman and runs `ghcr.io/n8n-io/n8n:VERSION@DIGEST` as `n8n.service`: a Quadlet unit on the host network that reads `keys.env`, mounts `/var/lib/n8n` as `/home/node/.n8n`, and carries the settings below. `postgres_password` and `environment` go to `/etc/containers/env/n8n.env`, mode `0600`, written from ephemeral values so they never reach the plan or state.
5. Waits up to 15 minutes for n8n to open its port. On a first start it pulls the image, which is about 280 MB compressed, and sets up its database before it listens.
6. With `owner`, writes the password and a small setup script to `/etc/n8n`, both `0600`, and creates the owner as described above.

The unit sets `N8N_LISTEN_ADDRESS`, `N8N_PORT`, `N8N_SECURE_COOKIE`, `N8N_PROXY_HOPS`, `EXECUTIONS_DATA_PRUNE` and `EXECUTIONS_DATA_MAX_AGE` from the inputs, the four URL variables from `public_url`, the `DB_` variables from `postgres`, and `N8N_DIAGNOSTICS_ENABLED`, `N8N_PERSONALIZATION_ENABLED` and `N8N_VERSION_NOTIFICATIONS_ENABLED` to `false`.

A change to any input restarts n8n. Workflows running at that moment are cut off.

### Who owns the data

n8n runs in the container as its `node` user, UID 1000, and Podman hands `/var/lib/n8n/data` to that UID each time the container starts. On a host where UID 1000 is also a person's account, as on many desktop and Raspberry Pi installs, that account owns n8n's files on paper, but can't reach them: only root can enter `/var/lib/n8n`. A host that ran an earlier version has its data moved there on the next apply, and n8n restarts.

### Pruning executions

n8n keeps the input and output of every execution, and on a busy instance that's most of the database. With the defaults, it deletes finished executions once they're 336 hours, two weeks, old. Change `executions_max_age` to keep more or less. `executions_prune = false` keeps them all, and the database grows until you delete them.

### Moving an existing instance

To bring an n8n you already run under this circuit, put its key in `/etc/n8n/keys.env`, mode `0600`, before the first apply:

```sh
N8N_ENCRYPTION_KEY=...
```

Find the key in the old instance's `N8N_ENCRYPTION_KEY`, or in the `encryptionKey` field of `~/.n8n/config` if n8n made its own. The circuit sees the file and keeps it. Copy the old `.n8n` directory to `/var/lib/n8n`, or point `postgres` at the existing database. n8n refuses to start if the key in `keys.env` and the one in `/var/lib/n8n/config` differ, rather than lose your credentials.

### What it doesn't do

- It doesn't set up TLS or a reverse proxy. n8n speaks plain HTTP on `listen_address`.
- It doesn't open a port in a firewall. With the default `listen_address`, nothing outside the host can reach n8n anyway.
- It doesn't back anything up. Back up `/var/lib/n8n/data` or PostgreSQL (see [circuit-restic](/circuits/restic)) and `keys.env`, separately.
- It doesn't run Python in the Code node. n8n runs Python only in a separate task runner container, `n8nio/runners`, which this circuit doesn't set up. JavaScript in the Code node works.
- It doesn't set up queue mode with Redis and workers. One n8n process does everything, which is plenty for most teams.
- Deleting the module leaves Podman, the container, `/etc/n8n` and `/var/lib/n8n` in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.50"`, or a host object such as `{ address = "192.168.1.50", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `public_url` | string | `null` | The address people and webhook callers reach n8n at, such as `"https://n8n.example.com"`, with no path. Sets `N8N_HOST`, `N8N_PROTOCOL`, `WEBHOOK_URL` and `N8N_EDITOR_BASE_URL`, and `N8N_SECURE_COOKIE` when it's HTTPS. |
| `owner` | object | `null` | The owner account to create on the first start: `email`, and optionally `first_name` and `last_name`, which default to `"Instance"` and `"Owner"`. When null, n8n asks the first person who opens it. |
| `owner_password` | string, sensitive, ephemeral | `null` | Password the owner is created with. Needed with `owner`. 8 to 64 characters with a digit and an uppercase letter. Ephemeral and sensitive: it reaches a root-only file on the host but never the plan or state. |
| `postgres` | object | `null` | PostgreSQL to keep n8n's data in: `host` (`"127.0.0.1"`), `port` (`5432`), `database` (`"n8n"`), `username` (`"n8n"`) and `schema` (`"public"`). The role and database must exist. When null, n8n uses SQLite in `/var/lib/n8n`. |
| `postgres_password` | string, sensitive, ephemeral | `null` | Password of the PostgreSQL user. Needed with `postgres`. Ephemeral and sensitive, like `owner_password`. |
| `executions_prune` | bool | `true` | Delete old execution data. Sets `EXECUTIONS_DATA_PRUNE`. |
| `executions_max_age` | number | `336` | Hours to keep finished executions before pruning deletes them. Sets `EXECUTIONS_DATA_MAX_AGE`. |
| `n8n_version` | string | `"2.45.6"` | Tag of n8n's image. Change `image_digest` with it. |
| `image_digest` | string | `"sha256:45edf896..."` | Digest of the image for `n8n_version`. Podman pulls by the digest. Find it on [Docker Hub](https://hub.docker.com/r/n8nio/n8n/tags) or with `skopeo inspect docker://docker.n8n.io/n8nio/n8n:TAG`. |
| `image_repository` | string | `"ghcr.io/n8n-io/n8n"` | Where to pull the image from. `"docker.n8n.io/n8nio/n8n"` (Docker Hub) serves the same digests. |
| `listen_address` | string | `"127.0.0.1"` | Address n8n listens on. `"0.0.0.0"` listens on every address. |
| `port` | number | `5678` | Port n8n listens on. |
| `proxy_hops` | number | `1` | How many reverse proxies stand in front of n8n. Sets `N8N_PROXY_HOPS`. `0` when people reach n8n directly. |
| `environment` | map(string), sensitive, ephemeral | `{}` | More of n8n's [environment variables](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables), such as `GENERIC_TIMEZONE`, `N8N_SMTP_HOST` or `N8N_SMTP_PASS`. Ephemeral and sensitive: they go into the root-only env file and never the plan or state. The variables the circuit sets itself aren't allowed here. |

## Outputs

| Name | Description |
| --- | --- |
| `service` | The systemd service that runs n8n, `n8n.service`. |
| `image` | The image the hosts run, with its tag and digest. |
| `url` | Where n8n answers on the host itself, such as `http://127.0.0.1:5678`. Point a reverse proxy here. |
| `keys_file` | `/etc/n8n/keys.env`, the file to back up. |

## Requirements

Requires Conn3x v0.6.9 or later and systemd on each host. The image is built for amd64 and arm64. Each host needs to reach its package mirror and Docker Hub, or GitHub's registry with `image_repository`. `conn3x init` fetches circuit-podman from GitHub.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-n8n/tree/v0.1.1/examples/local) to each on amd64, with SQLite and an owner, and checks that the second plan has no changes. It then checks `/healthz` answers `ok`, signs in as the owner through n8n's REST API and checks a wrong password is refused. It imports a workflow with a webhook trigger using `n8n import:workflow` in the container, publishes it with `n8n publish:workflow`, and restarts n8n. After the restart the owner signs in again, the webhook answers on `/webhook/ci-check`, and a third plan has no changes. CI pulls from `ghcr.io/n8n-io/n8n`, because GitHub's runners share Docker Hub's anonymous pull limit.

By hand, on DigitalOcean droplets with 2 GB of memory: an Ubuntu 24.04 droplet ran n8n on PostgreSQL from circuit-postgres, behind circuit-caddy with a Let's Encrypt certificate for an sslip.io name. The owner signed in over HTTPS with a secure cookie, the webhook answered through Caddy, and port 5678 didn't answer from outside. A Rocky Linux 10 droplet with SELinux enforcing ran the SQLite setup. Both passed the CI checks, came back on their own after a reboot with the owner and the webhook still working, and planned clean again; the Rocky audit log had no denials. Neither the generated key nor any password was in state.

On those droplets, pulls from Docker Hub hit its anonymous limit, which DigitalOcean's shared addresses run into quickly, so the runs there also used `ghcr.io/n8n-io/n8n`. The image is the same, by digest. Upgrading from one `n8n_version` to the next hasn't been tried yet.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-n8n/blob/v0.1.1/LICENSE).

n8n itself is not open source in the OSI sense. It's [fair-code](https://faircode.io), under n8n's [Sustainable Use License](https://github.com/n8n-io/n8n/blob/master/LICENSE.md): you may use and change it for your own internal business purposes, or for non-commercial or personal use, and running it on your own hosts for your team is exactly that. What it doesn't cover is making n8n a product for others: hosting it for customers to connect their own accounts and build workflows, or charging for a copy. That needs a commercial agreement with n8n. Files with `.ee.` in their names are under the separate n8n Enterprise License. If you're unsure whether your use fits, [n8n's licence page](https://docs.n8n.io/n8n-community-license) has worked examples.

## Source

- Repository: [conn3xorg/circuit-n8n](https://github.com/conn3xorg/circuit-n8n). This page covers [v0.1.1](https://github.com/conn3xorg/circuit-n8n/tree/v0.1.1); the repository's [tags](https://github.com/conn3xorg/circuit-n8n/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-n8n/tree/v0.1.1/examples/local).
- Related circuits: [PostgreSQL](/circuits/postgres), [Caddy](/circuits/caddy), [Podman](/circuits/podman), [restic](/circuits/restic), [Proxmox VE](/circuits/proxmox), [Forgejo](/circuits/forgejo), [GitLab CE](/circuits/gitlab), [Cockpit](/circuits/cockpit), [Fleet](/circuits/fleet).
