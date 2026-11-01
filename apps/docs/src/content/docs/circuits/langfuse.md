---
title: Langfuse
description: "Langfuse LLM observability on one host: prompts, costs and evals traced into ClickHouse, keys generated on the host, sign-up off."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-langfuse at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/langfuse/grade.svg)](https://conn3x.org/circuits/langfuse/grade)

A Conn3x circuit that runs [Langfuse](https://langfuse.com), the open-source LLM observability platform, on your own hosts. Every prompt your applications send, every response, its token count, cost and latency, and every evaluation score lands in one place you can search, and none of it leaves machines you run. If you have to show what your AI systems did and when, this is the record.

Langfuse 4 is four moving parts beside PostgreSQL and Redis: the web server, a worker, ClickHouse for the traces and an S3-compatible store for raw events. The circuit runs all four from official images under Podman, as systemd services pinned by tag and digest, on the host's network and listening only on loopback, apart from the web server's own `listen_address`. You bring PostgreSQL and Valkey; pair it with [circuit-postgres](/circuits/postgres) and [circuit-valkey](/circuits/valkey) and the whole stack fits on one host, on Debian, Ubuntu, Fedora or Rocky Linux.

The first start creates your organization, a project with the API keys you choose, and an owner account, then sign-up stays off. Langfuse's keys and the ClickHouse and MinIO passwords are made on the host by the first apply. They never pass through Conn3x, so they're not in your plan, your state or your CI logs, and the passwords and API keys you do pass in are ephemeral.

> **Back up `/etc/langfuse/keys.env`.** `ENCRYPTION_KEY` encrypts the secrets Langfuse stores, such as LLM provider keys, and `SALT` hashes every project API key. Lose the file and a database backup comes back with keys nobody can use and secrets nobody can read. Copy it somewhere safe, away from the database backups, as soon as the first apply finishes.

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

variable "admin_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

variable "langfuse_secret_key" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "postgres" {
  source = "github.com/conn3xorg/circuit-postgres?ref=v0.2.0"

  hosts                = { traces = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  users          = ["langfuse"]
  user_passwords = { langfuse = var.db_password }
  databases      = { langfuse = "langfuse" }
}

# Langfuse queues work in Valkey, so it must never evict keys. noeviction
# is circuit-valkey's default.
module "valkey" {
  source = "github.com/conn3xorg/circuit-valkey?ref=v0.1.0"

  hosts                = { traces = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  password = var.valkey_password
}

module "langfuse" {
  source = "github.com/conn3xorg/circuit-langfuse?ref=v0.1.0"

  depends_on = [module.postgres, module.valkey]

  hosts                = { traces = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  public_url   = "https://langfuse.example.com"
  database_url = "postgresql://langfuse:${var.db_password}@127.0.0.1:5432/langfuse"
  redis_url    = "redis://:${var.valkey_password}@127.0.0.1:6379"

  organization       = "acme"
  project            = "support-bot"
  admin_email        = "you@example.com"
  admin_password     = var.admin_password
  project_public_key = "pk-lf-support-bot"
  project_secret_key = var.langfuse_secret_key
}
```

Then run `conn3x init` and `conn3x apply` with the secrets in the environment:

```sh
export TF_VAR_db_password='...'
export TF_VAR_valkey_password='...'
export TF_VAR_admin_password='...'
export TF_VAR_langfuse_secret_key="sk-lf-$(openssl rand -hex 16)"
conn3x apply
```

A second `conn3x plan` says `No changes.` Every plan needs the same values, since Conn3x checks the env files on the host against them. A password with characters such as `@`, `:` or `/` has to be percent-encoded inside a URI; the simplest fix is a password of letters and digits.

Langfuse listens on `127.0.0.1:3000`. Put a reverse proxy in front for TLS, such as [circuit-caddy](/circuits/caddy) with `reverse_proxy 127.0.0.1:3000`, and set `public_url` to the address people type. Sign in as `admin_email`, and point your SDKs at `public_url` with the project's keys:

```sh
export LANGFUSE_BASE_URL=https://langfuse.example.com
export LANGFUSE_PUBLIC_KEY=pk-lf-support-bot
export LANGFUSE_SECRET_KEY=sk-lf-...
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-langfuse/tree/v0.1.0/examples/local).

### Memory

Plan on 4 GB for the host. On a 4 GB machine with PostgreSQL and Valkey beside it, the stack settled at about 2.0 to 2.3 GB in use once it had started, which leaves room for queries but not for much else. Langfuse's own guidance for a single VM is 4 cores and 16 GB, sized for real traffic; ClickHouse uses more as your traces grow, so watch it and move up when the host starts to swap.

The circuit reads each host's memory from the `conn3x_host` facts before it changes anything, and stops with an error below `min_memory_mb`, 3500 MiB by default, which a 4 GB host clears. Lower it if you know what you're doing.

### The first account, and keys

`organization`, `project`, `admin_email`, `admin_password` and the two project keys become Langfuse's [headless initialization](https://langfuse.com/self-hosting/administration/headless-initialization) variables. On its first start, Langfuse creates whatever doesn't exist yet. After that it leaves them alone, which has two consequences:

- Changing `admin_password` later doesn't change the password. Change it in the web interface instead.
- Changing `project_secret_key` for the same `project_public_key` doesn't replace the key. Use a new public key, or rotate keys in the project settings.

Leave both keys null and the project is still created; you make its API keys in the web interface. `signup` stays `false` unless you want anyone who can reach the page to register; the owner invites everyone else.

### Sending traces

Langfuse 4 takes traces over OpenTelemetry at `/api/public/otel/v1/traces`, which the current Python and JavaScript SDKs use. The older `/api/public/ingestion` endpoint and the v1 traces API refuse trace data on a new Langfuse 4 install. If you're moving a custom integration, see Langfuse's [ingestion migration guide](https://langfuse.com/integrations/native/opentelemetry/migration-to-v4).

## Why containers, and why these

Langfuse ships only container images, so the question is how to run them. This circuit uses Quadlet units through [circuit-podman](/circuits/podman) rather than Compose:

- **Each part is a systemd service.** `langfuse-web`, `langfuse-worker`, `langfuse-clickhouse` and `langfuse-minio` start at boot, restart when they fail, and log to the journal.
- **One pin per image, checked.** Each tag goes into its unit with a digest, and Podman pulls by the digest, so an image that's re-pushed upstream can't change what your hosts run.
- **Upgrades are a diff.** Change `langfuse_version` and the two digests, and `conn3x plan` shows the new images. The apply restarts the services, and Langfuse runs its migrations as it starts.

ClickHouse is `clickhouse/clickhouse-server`, at 26.8, the current long-term-support release; Langfuse 4 needs 25.12 or later and recommends 26.4 or later. It gets a small config file that keeps it on `127.0.0.1` and turns off the MySQL, PostgreSQL and interserver ports Langfuse doesn't use. Its data is in the `langfuse-clickhouse` volume.

The S3 store is MinIO, because that's what Langfuse's own [Docker Compose file](https://github.com/langfuse/langfuse/blob/main/docker-compose.yml) runs, from the same image: `cgr.dev/chainguard/minio`. Know what you're getting. The upstream `minio/minio` repository was archived in April 2026 and says it's no longer maintained; MinIO now points community users at its own AIStor Free. Chainguard keeps building the open-source server from [its own fork](https://github.com/chainguard-forks/minio), under the AGPL v3, and that's what this image is. Chainguard's free images carry only a `latest` tag, so `minio_image_digest` is the pin. Langfuse also documents [SeaweedFS](https://langfuse.com/self-hosting/deployment/infrastructure/blobstorage#seaweedfs), Apache 2.0 licensed, which its Helm chart uses; this circuit doesn't offer it yet. MinIO's data is in the `langfuse-minio` volume.

## What it does

On each host, in order:

1. Reads the host's facts, and stops if it has less memory than `min_memory_mb`.
2. Creates `/etc/langfuse`, mode `0700`, owned by root.
3. If `/etc/langfuse/keys.env` doesn't exist, generates `NEXTAUTH_SECRET`, `SALT`, `ENCRYPTION_KEY` and the ClickHouse and MinIO passwords from `/dev/urandom`, all in hex. `keys.env` holds what Langfuse needs; `clickhouse.env` and `minio.env` hold only their own password. All three are mode `0600`. Once `keys.env` exists the circuit never touches them again, so no key changes under a running instance.
4. Writes `/etc/langfuse/clickhouse.xml`, which keeps ClickHouse on loopback.
5. Through [circuit-podman](/circuits/podman) v0.1.0, installs Podman and runs four Quadlet units on the host network:
   - `langfuse-clickhouse` on `127.0.0.1:8123` (HTTP) and `127.0.0.1:9000` (native), as the image's `clickhouse` user.
   - `langfuse-minio` on `127.0.0.1:9002`, with its web console off. It makes the `langfuse` bucket as it starts.
   - `langfuse-worker`, with its health port on `127.0.0.1:3030`.
   - `langfuse-web` on `listen_address:port`, with telemetry off and sign-up off unless `signup` is set.

   `database_url`, `redis_url`, `admin_password`, the project keys and `environment` go to `/etc/containers/env/langfuse-web.env` and `langfuse-worker.env`, mode `0600`, written from ephemeral values so they never reach the plan or state.
6. Waits up to fifteen minutes for the web server to open its port. On a first start it pulls about 3.6 GB of images and runs the PostgreSQL and ClickHouse migrations before it listens. A whole first apply, PostgreSQL and Valkey included, took three to four minutes on a fresh 4 GB host.

A change to any input restarts the containers it touches.

### Moving an existing instance

To bring a Langfuse you already run under this circuit, write its keys to `/etc/langfuse/keys.env`, mode `0600`, before the first apply, along with `clickhouse.env` and `minio.env` in the same form:

```sh
NEXTAUTH_SECRET=...
SALT=...
ENCRYPTION_KEY=...
CLICKHOUSE_PASSWORD=...
LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY=...
LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY=...
```

The circuit sees `keys.env` and keeps all three. Point `database_url` at the existing database. ClickHouse and MinIO data has to be copied into the new volumes by hand.

### What it doesn't do

- It doesn't set up TLS or a reverse proxy. Langfuse speaks plain HTTP on `listen_address`.
- It doesn't open a port in a firewall. With the default `listen_address`, nothing outside the host can reach Langfuse anyway.
- It doesn't expose MinIO. Langfuse writes events there itself, so tracing works, but SDKs that upload images, audio or files straight to the store need it reachable from outside, with `LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT` pointing at it. That's not supported here yet.
- It doesn't back anything up. PostgreSQL, the two volumes and `keys.env` all matter; see [circuit-restic](/circuits/restic).
- It doesn't run Langfuse's add-on features that need a licence key, or connect an LLM for evaluations. Add those through `environment`.
- Deleting the module leaves Podman, the containers, their volumes and `/etc/langfuse` in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.50"`, or a host object such as `{ address = "192.168.1.50", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `public_url` | string | Required | The address people and SDKs reach Langfuse at, such as `"https://langfuse.example.com"`. Langfuse uses it as `NEXTAUTH_URL` for sign-in redirects and links. |
| `database_url` | string, sensitive, ephemeral | Required | PostgreSQL connection URI, such as `"postgresql://langfuse:PASSWORD@127.0.0.1:5432/langfuse"`. PostgreSQL 15 or later. Ephemeral and sensitive: it reaches the host's env files but never the plan or state. |
| `redis_url` | string, sensitive, ephemeral | Required | Redis or Valkey URL, such as `"redis://:PASSWORD@127.0.0.1:6379"`. Redis 7 or Valkey, with `maxmemory-policy noeviction`. Ephemeral and sensitive. |
| `admin_email` | string | Required | Email address of the first user, who owns the organization. |
| `admin_password` | string, sensitive, ephemeral | Required | That user's password, at least 8 characters. Ephemeral and sensitive. Langfuse sets it only when it creates the user. |
| `organization` | string | `"default"` | ID and name of the organization created on the first start. Lowercase letters, digits and hyphens. |
| `project` | string | `"default"` | ID and name of the project created in it. |
| `project_public_key` | string, sensitive, ephemeral | `null` | Public API key for the project, such as `"pk-lf-..."`. Set it with `project_secret_key`, or leave both null. Ephemeral and sensitive. |
| `project_secret_key` | string, sensitive, ephemeral | `null` | Secret API key for the project, such as `"sk-lf-..."`. Ephemeral and sensitive. |
| `signup` | bool | `false` | Let anyone who can reach Langfuse create an account. |
| `listen_address` | string | `"127.0.0.1"` | Address the web server listens on. `"0.0.0.0"` listens on every address. |
| `port` | number | `3000` | Port the web server listens on. |
| `min_memory_mb` | number | `3500` | Memory, in MiB, a host needs before the circuit configures it. |
| `langfuse_version` | string | `"4.72.0"` | Tag of `docker.io/langfuse/langfuse` and `docker.io/langfuse/langfuse-worker`. Change both digests with it. |
| `web_image_digest` | string | `"sha256:c311fd9d..."` | Digest of the web image for `langfuse_version`. Find it on [Docker Hub](https://hub.docker.com/r/langfuse/langfuse/tags) or with `skopeo inspect docker://docker.io/langfuse/langfuse:TAG`. |
| `worker_image_digest` | string | `"sha256:aa1724b9..."` | Digest of the worker image for `langfuse_version`. |
| `clickhouse_version` | string | `"26.8.36.3"` | Tag of `docker.io/clickhouse/clickhouse-server`. 25.12 or later. Change `clickhouse_image_digest` with it. |
| `clickhouse_image_digest` | string | `"sha256:d426d2f6..."` | Digest of the ClickHouse image for `clickhouse_version`. |
| `minio_image_digest` | string | `"sha256:e234321f..."` | Digest of `cgr.dev/chainguard/minio:latest` to run. |
| `environment` | map(string), sensitive, ephemeral | `{}` | More of Langfuse's [environment variables](https://langfuse.com/self-hosting/configuration) for the web and worker, such as `SMTP_CONNECTION_URL` and `EMAIL_FROM_ADDRESS`. Ephemeral and sensitive: they go into the same env files and never the plan or state. The variables the circuit sets itself aren't allowed. |

## Outputs

| Name | Description |
| --- | --- |
| `services` | The four systemd services that run the stack. |
| `images` | The image each service runs, with its tag and digest. |
| `keys_file` | `/etc/langfuse/keys.env`, the file to back up. |

## Requirements

Requires Conn3x v0.6.9 or later and systemd on each host, with about 4 GB of memory (see [Memory](#memory)) and room for 3.6 GB of images plus your traces. All four images are built for amd64 and arm64. Each host needs to reach its package mirror, Docker Hub and `cgr.dev`, and a PostgreSQL 15 or later and a Redis 7 or later, or Valkey. `conn3x init` fetches circuit-podman from GitHub.

## Tested on

Ubuntu 24.04, Debian 13, Rocky Linux 10 with SELinux enforcing, and Fedora 44, each a 4 GB DigitalOcean droplet on amd64 running [examples/local](https://github.com/conn3xorg/circuit-langfuse/tree/v0.1.0/examples/local) with circuit-postgres and circuit-valkey on the same host. On each, the second plan was clean; `/api/public/health` answered `OK`; a sign-up was refused with `Sign up is disabled.`; the keys from headless initialization sent a trace over OTLP, and the worker had it in ClickHouse, readable through `/api/public/v2/observations`, within three seconds. A wrong secret key got a 401. On Debian, all four services were restarted and the same trace read back. Ubuntu and Rocky were rebooted: everything came back on its own, the trace was still there, the plan was clean, and Rocky's audit log had no SELinux denials. From outside the Rocky droplet, ports 3000 and 9002 didn't answer.

Rocky Linux turned up one thing worth knowing: its cloud image has Cockpit on port 9090, where Langfuse's Compose file puts MinIO, which is why the circuit uses 9002.

Fedora 45 ran in a local container from Conn3x's test images, through the same checks plus a restart of all four services. The CI workflow applies the example to Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13 in containers on amd64 and runs the same checks, with a restart of all four services in place of the reboot.

Upgrading from one `langfuse_version` to the next hasn't been tried yet.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-langfuse/blob/v0.1.0/LICENSE). Langfuse itself is under the MIT license, apart from its `ee` directories. ClickHouse is under the Apache License 2.0, and MinIO under the AGPL v3.

## Source

- Repository: [conn3xorg/circuit-langfuse](https://github.com/conn3xorg/circuit-langfuse). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-langfuse/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-langfuse/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-langfuse/tree/v0.1.0/examples/local).
- Related circuits: [PostgreSQL](/circuits/postgres), [Valkey](/circuits/valkey), [Caddy](/circuits/caddy), [Podman](/circuits/podman), [restic](/circuits/restic), [Ollama](/circuits/ollama), [Qdrant](/circuits/qdrant), [Open WebUI](/circuits/openwebui), [LiteLLM](/circuits/litellm), [Presidio](/circuits/presidio), [Agent box](/circuits/agentbox).
