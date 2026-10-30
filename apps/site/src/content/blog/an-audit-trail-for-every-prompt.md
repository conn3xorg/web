---
title: "An audit trail for every prompt"
description: "When an AI feature gives a customer a wrong answer, someone will ask what it was told and what it said. circuit-langfuse runs Langfuse 4 on one host of your own, so every prompt, response, cost and latency lands where you can search it and nobody else can."
date: 2026-12-16
author: James Conway
image: /media/blog/an-audit-trail-for-every-prompt/card.png
imageAlt: "An audit trail for every prompt. An app sends traces over OpenTelemetry to Langfuse 4 on 127.0.0.1:3000, where sign-up is off and a wrong key gets 401, and the traces land in ClickHouse, readable within three seconds."
series: "AI you can account for"
---

A customer forwards a screenshot. Your support bot told them their refund was approved. It wasn't. Now three people want to know the same thing: what exactly did the bot get sent, what did it answer, and has it done this before?

If the answer lives in a vendor's dashboard, you're filing a ticket. If it lives in your application logs, you're grepping JSON at midnight. What you want is a record of every call, kept somewhere you control, that you can search by user, by day or by how much it cost.

That's tracing, and [Langfuse](https://langfuse.com) is the open-source platform for it. [circuit-langfuse](https://github.com/conn3xorg/circuit-langfuse) runs it on your own host. It's the last post in our series on [AI you can account for](/blog/ai-you-can-account-for), and it answers the question auditors ask most bluntly: show me what it did.

<figure>
  <a href="/media/blog/an-audit-trail-for-every-prompt/trace.png">
    <img src="/media/blog/an-audit-trail-for-every-prompt/trace.png" width="1600" height="1939" loading="lazy" decoding="async" alt="An audit trail for every prompt. The LiteLLM gateway sends a trace of every call, your apps send traces with Langfuse's SDKs over OpenTelemetry, and your people use the web UI through Caddy. On one 4 GB host, on loopback only, langfuse-web on port 3000, langfuse-worker, ClickHouse and MinIO run as systemd services, with PostgreSQL and Valkey beside them. Keys are made on the host by the first apply. A trace holds the prompt, response, tokens, cost and latency." />
  </a>
  <figcaption>Four services from the circuit, two you bring, and every key made on the host.</figcaption>
</figure>

<details>
<summary>Read the diagram as text</summary>

- **Coming in:** the LiteLLM gateway, with `langfuse_url`, sends a trace of every call. Your apps, with Langfuse's Python or JavaScript SDKs and the project's `pk-lf-` and `sk-lf-` keys, send traces over OpenTelemetry. Your people use the web UI through Caddy; sign-up is off and the owner invites everyone else.
- **On one 4 GB host, loopback only:** `langfuse-web` on `:3000` takes traces and serves the UI, with telemetry off. `langfuse-worker` on `:3030` moves queued events into ClickHouse. ClickHouse 26.8 LTS on `:8123` and `:9000` holds the traces. MinIO on `:9002`, Chainguard's build of the open-source server, holds raw events.
- **You bring:** PostgreSQL for users, projects and keys (circuit-postgres), and Valkey for the queue, with `noeviction` (circuit-valkey).
- **Keys:** `/etc/langfuse/keys.env` holds `NEXTAUTH_SECRET`, `SALT`, `ENCRYPTION_KEY` and the ClickHouse and MinIO passwords, made on the host by the first apply and never in your plan or state. Back it up.
- **A trace holds:** the prompt, the response, tokens, cost and latency.
- **Know this:** it can keep the prompts, which is the point and also a store of everything anyone typed. And the upstream `minio/minio` repository was archived in April 2026; this runs Chainguard's AGPL fork, pinned by digest.
- **Tested:** on 4 GB droplets with Ubuntu, Debian, Rocky Linux and Fedora, sign-up was refused, a trace over OTLP was readable within three seconds, a wrong secret key got a `401`, and the trace was still there after a reboot.

</details>

## What one apply builds

Langfuse 4 has four moving parts beside PostgreSQL and Redis: the web server, a worker, ClickHouse for the traces, and an S3-compatible store for raw events. The circuit runs all four from official images under Podman, as systemd services pinned by tag and digest, listening on loopback. You bring PostgreSQL and Valkey, and the Conn3x circuits for both fit on the same host.

Here's the README's usage. It's long because it's honest about the secrets, every one of them ephemeral:

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

```sh
export TF_VAR_db_password='...'
export TF_VAR_valkey_password='...'
export TF_VAR_admin_password='...'
export TF_VAR_langfuse_secret_key="sk-lf-$(openssl rand -hex 16)"
conn3x apply
```

The first apply pulls about 3.6 GB of images and runs the database migrations. On a fresh 4 GB host, PostgreSQL and Valkey included, it took three to four minutes. When it's done, there's an organization, a project with the API keys you chose, and an owner account, and sign-up is off.

Point your SDKs at it:

```sh
export LANGFUSE_BASE_URL=https://langfuse.example.com
export LANGFUSE_PUBLIC_KEY=pk-lf-support-bot
export LANGFUSE_SECRET_KEY=sk-lf-...
```

Langfuse listens on `127.0.0.1:3000`, so that URL wants [circuit-caddy](https://github.com/conn3xorg/circuit-caddy) in front with `reverse_proxy 127.0.0.1:3000`.

## The keys you never see

Langfuse needs a handful of secrets of its own: one to sign sessions, a salt that hashes every project API key, an encryption key for the provider keys it stores, and passwords for ClickHouse and MinIO. The first apply makes all of them on the host, from `/dev/urandom`, into files only root can read. They never pass through Conn3x, so they're not in your plan, your state or your CI logs. And once they exist, the circuit never touches them again, so no key changes under a running instance.

That's also why the README opens with a warning worth repeating. Back up `/etc/langfuse/keys.env`, away from the database backups. Lose it, and a restored database comes back with API keys nobody can use and secrets nobody can read.

## Traces arrive over OpenTelemetry

Langfuse 4 takes traces over OpenTelemetry at `/api/public/otel/v1/traces`, which the current Python and JavaScript SDKs use. One thing to know if you're moving an old integration: the older `/api/public/ingestion` endpoint and the v1 traces API refuse trace data on a new Langfuse 4 install. Langfuse has a [migration guide](https://langfuse.com/integrations/native/opentelemetry/migration-to-v4).

## Every gateway call, traced

Your apps can send traces themselves. But if they already go through the [LiteLLM gateway](/blog/one-gateway-for-every-model), there's a shorter way: circuit-litellm v0.2.0 sends a trace of every call for them. From its [README](https://github.com/conn3xorg/circuit-litellm#traces-in-langfuse):

```hcl
module "litellm" {
  # ...as above, and:
  langfuse_url = "http://127.0.0.1:3000"
  api_keys = {
    OPENAI_API_KEY      = var.openai_api_key
    LANGFUSE_PUBLIC_KEY = "pk-lf-gateway"
    LANGFUSE_SECRET_KEY = var.langfuse_secret_key
  }
}
```

The project's keys go in `api_keys`, so they reach the host's env file and never the plan or state. LiteLLM sends OpenTelemetry, which is what Langfuse 4 takes; LiteLLM's older `langfuse` callback uses the ingestion API a new Langfuse 4 install refuses.

What a trace holds follows LiteLLM's `log_prompts`. Off, the default, its input and output read `redacted-by-litellm`, with the model, tokens, cost and timing all there. On, they hold the prompt and the answer, and with the [Presidio guardrail](/blog/scrub-it-before-the-model-sees-it) in place, the prompt is the masked one: `<PERSON>`, not the name. We tested exactly that on an Ubuntu 24.04 droplet with 8 GB, running LiteLLM, Presidio and Langfuse together. Each request showed up in Langfuse as a generation within seconds, and the project keys weren't in the state.

## Two things to know before you start

**It can keep the prompts.** That's the whole point of a trace from your own SDK, and it's the opposite of the choice the LiteLLM gateway makes by default. A Langfuse full of traces is also a searchable copy of everything anyone typed into your AI features, customer details included. Keep sign-up off, keep the invite list short, and if [Presidio](/blog/scrub-it-before-the-model-sees-it) is in your stack, think about what it should see before Langfuse does.

**About MinIO.** Langfuse's own Docker Compose file runs MinIO as its S3 store, from Chainguard's image, and so does this circuit. You should know that the upstream `minio/minio` repository was archived in April 2026 and says it's no longer maintained. Chainguard keeps building the open-source server from its own fork, under the AGPL v3, and that's what runs here, pinned by digest. Langfuse also documents SeaweedFS; the circuit doesn't offer it yet.

## How big is it?

Plan on 4 GB of memory. With PostgreSQL and Valkey beside it, the stack settled at about 2.0 to 2.3 GB once it had started, which leaves room for queries but not much else. Langfuse's own guidance for a single VM is 4 cores and 16 GB, sized for real traffic, and ClickHouse grows as your traces do. The circuit checks each host's memory before it changes anything, and stops below 3,500 MiB.

## What we tested

On 4 GB DigitalOcean droplets running Ubuntu 24.04, Debian 13, Rocky Linux 10 with SELinux enforcing, and Fedora 44, each with PostgreSQL and Valkey on the same host: the second plan was clean, the health check answered, a sign-up was refused with `Sign up is disabled.`, and the project keys sent a trace over OTLP that the worker had in ClickHouse, readable through the API, within three seconds. A wrong secret key got a `401`.

On Debian all four services were restarted and the trace read back. Ubuntu and Rocky were rebooted, and everything came back on its own with the trace still there and the plan clean. From outside the Rocky droplet, ports 3000 and 9002 didn't answer. CI runs the same checks on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13 in containers.

Rocky turned up one surprise worth passing on: its cloud image runs Cockpit on port 9090, which is where Langfuse's Compose file puts MinIO. That's why the circuit uses 9002.

## What it doesn't do

- **No TLS, no open port.** Langfuse speaks plain HTTP on loopback; Caddy goes in front.
- **No direct media uploads.** MinIO stays on loopback, so tracing works, but SDKs that upload images, audio or files straight to the store need it reachable from outside. That's not supported yet.
- **No backups.** PostgreSQL, the ClickHouse and MinIO volumes, and `keys.env` all matter; see [circuit-restic](https://github.com/conn3xorg/circuit-restic).
- **No licensed extras.** Langfuse's add-on features that need a licence key, and an LLM for evaluations, are yours to add through `environment`.
- **Upgrades are untested.** Moving from one `langfuse_version` to the next hasn't been tried yet.

## Try it, and that's the series

The [README](https://github.com/conn3xorg/circuit-langfuse) has every input, and [examples/local](https://github.com/conn3xorg/circuit-langfuse/tree/main/examples/local) runs it on a throwaway container.

Six questions: where the prompts go, who can use what, who asked, what stops personal data, what changed, and whether the box is locked down. Most of the answers are a circuit you can apply today, and the gaps are marked where they are. If an auditor asks you something the [map](/blog/ai-you-can-account-for) didn't cover, [open a discussion](https://github.com/conn3xorg/conn3x/discussions) and tell us. That's how the next circuit gets picked.
