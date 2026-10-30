---
title: Infisical
description: "Runs Infisical, the open-source secrets manager, from its official image under Podman, with PostgreSQL and Valkey, keys made on the host."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-infisical at v0.1.0. -->

A Conn3x circuit that runs [Infisical](https://infisical.com), the open-source secrets manager, on your own hosts. Your team gets one place for API keys, database passwords and certificates, with projects, environments, access control and an audit log, and none of it leaves machines you run.

Infisical runs from its official image, `infisical/infisical`, under Podman as a systemd service, pinned by tag and digest. It keeps everything in PostgreSQL and uses Redis or Valkey for queues and caching; you point it at both with two connection strings. Pair it with [circuit-postgres](/circuits/postgres) and [circuit-valkey](/circuits/valkey) and the whole stack fits on one host, on Debian, Ubuntu, Fedora or Rocky Linux.

The two keys Infisical can't live without, `ENCRYPTION_KEY` and `AUTH_SECRET`, are made on the host by the first apply. They never pass through Conn3x, so they're not in your plan, your state or your CI logs.

> **Back up `/etc/infisical/keys.env`.** `ENCRYPTION_KEY` encrypts every secret Infisical stores. Lose it, and a database backup is a pile of ciphertext nobody can read, including you. Copy the file somewhere safe, away from the database backups, as soon as the first apply finishes.

## Usage

```hcl
variable "db_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

variable "valkey_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "postgres" {
  source = "github.com/conn3xorg/circuit-postgres?ref=v0.2.0"

  hosts                = { secrets = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  users          = ["infisical"]
  user_passwords = { infisical = var.db_password }
  databases      = { infisical = "infisical" }
}

module "valkey" {
  source = "github.com/conn3xorg/circuit-valkey?ref=v0.1.0"

  hosts                = { secrets = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  password = var.valkey_password
}

module "infisical" {
  source = "github.com/conn3xorg/circuit-infisical?ref=v0.1.0"

  depends_on = [module.postgres, module.valkey]

  hosts                = { secrets = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  site_url          = "https://secrets.example.com"
  db_connection_uri = "postgres://infisical:${var.db_password}@127.0.0.1:5432/infisical"
  redis_url         = "redis://:${var.valkey_password}@127.0.0.1:6379"
}
```

Then run `conn3x init` and `conn3x apply` with the passwords in the environment:

```sh
export TF_VAR_db_password='...'
export TF_VAR_valkey_password='...'
conn3x apply
```

A second `conn3x plan` says `No changes.` Every plan needs the passwords too, since Conn3x checks the env file on the host against them. A password with characters such as `@`, `:` or `/` has to be percent-encoded inside a URI; the simplest fix is a password of letters and digits.

Infisical listens on `127.0.0.1:8080`. Put a reverse proxy in front for TLS, such as [circuit-caddy](/circuits/caddy) with `reverse_proxy 127.0.0.1:8080`, and set `site_url` to the address people type. Then open it and create the first admin account, or do it without a browser through the bootstrap API (see below).

PostgreSQL and Valkey can live elsewhere, such as a managed database. Give their addresses in the two URIs, and leave out `depends_on`.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-infisical/tree/v0.1.0/examples/local).

### The first admin

Infisical's web interface asks for an admin account the first time you open it. For an automated setup, its [bootstrap API](https://infisical.com/docs/self-hosting/guides/automated-bootstrapping) does the same in one request, and also creates an organisation and an instance admin machine identity:

```sh
curl -sf -X POST -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"...","organization":"homelab"}' \
  http://127.0.0.1:8080/api/v1/admin/bootstrap
```

The answer carries that identity's token, which can do anything on the instance, so treat it like a root password. Bootstrapping works once; after that the endpoint refuses. The circuit doesn't do this for you, because the token would then sit in state.

## Why a container

Infisical offers a Docker image, Docker Compose, a Helm chart, and Linux packages (`infisical-core`, as `.deb` and `.rpm`). This circuit uses the image:

- **It runs on all four distributions, on amd64 and arm64.** The Linux packages are amd64 only for now, and come from a repository you add by piping a setup script into `bash`.
- **One pin, checked.** `infisical_version` and `image_digest` go into the unit together, and Podman pulls by the digest, so a tag that's re-pushed upstream can't change what your hosts run.
- **Upgrades are a diff.** Change both inputs and `conn3x plan` shows the new image in the unit file. The apply restarts Infisical on it, and Infisical runs its database migrations as it starts.

The container keeps nothing of its own. Everything Infisical stores is in PostgreSQL, so there's no volume to back up, only the database and `keys.env`.

It uses the host's network rather than a published port. That way it reaches a PostgreSQL and a Valkey that listen only on localhost, which is how circuit-postgres and circuit-valkey start out, and `listen_address` is a real address on the host.

## What it does

On each host, in order:

1. Creates `/etc/infisical`, mode `0700`, owned by root.
2. If `/etc/infisical/keys.env` doesn't exist, writes it, mode `0600`: `ENCRYPTION_KEY` as 16 random bytes in hex and `AUTH_SECRET` as 32 random bytes in base64, both from `/dev/urandom`. Once the file exists the circuit never touches it again, so neither key changes under a running instance.
3. Through [circuit-podman](/circuits/podman) v0.1.0, installs Podman and runs `docker.io/infisical/infisical:VERSION@DIGEST` as `infisical.service`: a Quadlet unit on the host network that reads `keys.env`, with `HOST`, `PORT` and `SITE_URL` in the unit. `db_connection_uri`, `redis_url` and `environment` go to `/etc/containers/env/infisical.env`, mode `0600`, written from ephemeral values so they never reach the plan or state.
4. Waits up to ten minutes for Infisical to open its port. On a first start it pulls the image, which is about 600 MB compressed, and runs its migrations before it listens.

A change to any input restarts Infisical, which took under a minute in testing.

### Moving an existing instance

To bring an Infisical you already run under this circuit, put its keys in `/etc/infisical/keys.env`, mode `0600`, before the first apply:

```sh
ENCRYPTION_KEY=...
AUTH_SECRET=...
```

The circuit sees the file and keeps it. Point `db_connection_uri` at the existing database.

### What it doesn't do

- It doesn't set up TLS or a reverse proxy. Infisical speaks plain HTTP on `listen_address`.
- It doesn't open a port in a firewall. With the default `listen_address`, nothing outside the host can reach Infisical anyway.
- It doesn't back anything up. Back up PostgreSQL (see [circuit-restic](/circuits/restic)) and `keys.env`, separately.
- It doesn't create the first admin, projects or secrets.
- It doesn't turn off telemetry: Infisical sends anonymous usage data by default. Add `TELEMETRY_ENABLED = "false"` to `environment` to stop it.
- Deleting the module leaves Podman, the container and `/etc/infisical` in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.50"`, or a host object such as `{ address = "192.168.1.50", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `site_url` | string | Required | The address people and clients reach Infisical at, such as `"https://secrets.example.com"`. Infisical uses it for CORS, links in emails and SSO redirects. |
| `db_connection_uri` | string, sensitive, ephemeral | Required | PostgreSQL connection URI, such as `"postgres://infisical:PASSWORD@127.0.0.1:5432/infisical"`. PostgreSQL 14 or later. Ephemeral and sensitive: it reaches the host's env file but never the plan or state. |
| `redis_url` | string, sensitive, ephemeral | Required | Redis or Valkey URL, such as `"redis://:PASSWORD@127.0.0.1:6379"`. Ephemeral and sensitive, like `db_connection_uri`. |
| `infisical_version` | string | `"v0.167.4"` | Tag of `docker.io/infisical/infisical`. Change `image_digest` with it. |
| `image_digest` | string | `"sha256:80a3bb51..."` | Digest of the image for `infisical_version`. Podman pulls by the digest. Find it on [Docker Hub](https://hub.docker.com/r/infisical/infisical/tags) or with `skopeo inspect docker://docker.io/infisical/infisical:TAG`. |
| `listen_address` | string | `"127.0.0.1"` | Address Infisical listens on. `"0.0.0.0"` listens on every address. |
| `port` | number | `8080` | Port Infisical listens on. |
| `environment` | map(string), sensitive, ephemeral | `{}` | More of Infisical's [environment variables](https://infisical.com/docs/self-hosting/configuration/envars), such as `SMTP_HOST`, `SMTP_PASSWORD` or `TELEMETRY_ENABLED`. Ephemeral and sensitive: they go into the same env file and never the plan or state. The variables that have inputs of their own, and the two generated keys, aren't allowed here. |

## Outputs

| Name | Description |
| --- | --- |
| `service` | The systemd service that runs Infisical, `infisical.service`. |
| `image` | The image the hosts run, with its tag and digest. |
| `keys_file` | `/etc/infisical/keys.env`, the file to back up. |

## Requirements

Requires Conn3x v0.6.9 or later and systemd on each host. The image is built for amd64 and arm64. Each host needs to reach its package mirror and Docker Hub, and a PostgreSQL 14 or later and a Redis 6 or later, or Valkey. `conn3x init` fetches circuit-podman from GitHub.

The whole stack, Infisical with PostgreSQL and Valkey beside it, ran on 2 GB of memory in testing.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-infisical/tree/v0.1.0/examples/local) to each on amd64, with circuit-postgres and circuit-valkey on the same host, and checks that the second plan has no changes. It then checks `/api/status` answers `Ok`, bootstraps the first admin through `/api/v1/admin/bootstrap`, uses the admin identity's token to create a project and store a secret, and reads it back. A second bootstrap has to be refused. It restarts Infisical and reads the secret again with the same token, which only works if the database, `ENCRYPTION_KEY` and `AUTH_SECRET` all came through the restart.

The same checks passed by hand on an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, each with 2 GB of memory and the whole stack on one host. From outside, port 8080 didn't answer. After a reboot Infisical came back on its own, the secret read back with the token from before, the second plan was clean, and the Rocky audit log had no denials.

Upgrading from one `infisical_version` to the next hasn't been tried yet.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-infisical/blob/v0.1.0/LICENSE). Infisical itself is under the MIT license, apart from its `ee` directories.

## Source

- Repository: [conn3xorg/circuit-infisical](https://github.com/conn3xorg/circuit-infisical). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-infisical/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-infisical/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-infisical/tree/v0.1.0/examples/local).
- Related circuits: [PostgreSQL](/circuits/postgres), [Valkey](/circuits/valkey), [Caddy](/circuits/caddy), [Podman](/circuits/podman), [restic](/circuits/restic), [Users](/circuits/users), [LLDAP](/circuits/lldap), [OpenLDAP](/circuits/openldap), [Keycloak](/circuits/keycloak), [OpenBao](/circuits/openbao).
