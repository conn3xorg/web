---
title: Open WebUI
description: "Open WebUI in Podman: private chat for Ollama or a gateway, first admin from code, sign-up closed, per-user model access, no telemetry"
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-openwebui at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/openwebui/grade.svg)](https://conn3x.org/circuits/openwebui/grade)

A Conn3x circuit that runs [Open WebUI](https://github.com/open-webui/open-webui), the self-hosted chat front end for local and hosted models, on your own hosts. Your people get a ChatGPT-style page in the browser; you decide who has an account, which models each of them can use, and where the conversations are kept.

Open WebUI runs from its official image, `ghcr.io/open-webui/open-webui`, under Podman as a systemd service, pinned by tag and digest. Pair it with [circuit-ollama](/circuits/ollama) on the same host and nothing you type leaves the machine. Point it at an OpenAI-compatible API too, such as a [LiteLLM](https://github.com/BerriAI/litellm) gateway, and it can reach hosted models as well, through one address you control.

The settings start closed. Nobody can sign up. The first admin is created from inputs you give, before the port opens. Users see no model until an admin gives them one. Open WebUI's telemetry, update check and community sharing are off. It runs on Debian, Ubuntu, Fedora and Rocky Linux.

## Usage

```hcl
variable "admin_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "ollama" {
  source = "github.com/conn3xorg/circuit-ollama?ref=v0.1.1"

  hosts                = { ai = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  models = ["qwen2.5:0.5b"]
}

module "openwebui" {
  source = "github.com/conn3xorg/circuit-openwebui?ref=v0.1.0"

  depends_on = [module.ollama]

  hosts                = { ai = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  admin_email    = "you@example.com"
  admin_password = var.admin_password
}
```

Then run `conn3x init` and `conn3x apply` with the password in the environment:

```sh
export TF_VAR_admin_password='...'
conn3x apply
```

A second `conn3x plan` says `No changes.` Every plan needs the password too, since Conn3x checks the env file on the host against it.

Open WebUI listens on `127.0.0.1:8080` and talks to Ollama at `http://127.0.0.1:11434`, circuit-ollama's default. Put a reverse proxy in front for TLS, such as [circuit-caddy](/circuits/caddy) with `reverse_proxy 127.0.0.1:8080`, and sign in with the admin account. To reach it without a proxy, tunnel over SSH: `ssh -L 8080:127.0.0.1:8080 root@192.168.1.50`, then open `http://localhost:8080`.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-openwebui/tree/v0.1.0/examples/local).

### Hosted models through a gateway

`openai_base_url` adds an OpenAI-compatible connection. A LiteLLM gateway on the same host, such as one from circuit-litellm, listens on `127.0.0.1:4000` by default:

```hcl
module "openwebui" {
  # ...
  openai_base_url = "http://127.0.0.1:4000/v1"
  openai_api_key  = var.litellm_key
}
```

The key is ephemeral: it reaches the host in a root-only file and never your plan or state. Giving Open WebUI a gateway key rather than a provider's key keeps the provider keys, budgets and logs in one place, and lets you take a model away from everyone by removing it there.

### PostgreSQL

Open WebUI keeps its data in SQLite inside its volume unless you give it `database_url`. With [circuit-postgres](/circuits/postgres):

```hcl
module "postgres" {
  source = "github.com/conn3xorg/circuit-postgres?ref=v0.2.0"

  hosts                = { ai = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  users          = ["openwebui"]
  user_passwords = { openwebui = var.db_password }
  databases      = { openwebui = "openwebui" }
}

module "openwebui" {
  # ...
  depends_on   = [module.ollama, module.postgres]
  database_url = "postgresql://openwebui:${var.db_password}@127.0.0.1:5432/openwebui"
}
```

Choose before the first apply. Switching later starts Open WebUI on an empty database; it doesn't move what SQLite held.

## Who can do what

This is the part worth reading before you hand out the address.

**Who can sign up.** Nobody, by default. `enable_signup = false` keeps the sign-up form shut once there's an account. Open WebUI always lets the very first account through, and makes it an admin, which is why the circuit creates that account itself: with `admin_email` and `admin_password` set, Open WebUI makes the admin as it starts, before it opens its port, so there's no moment when a stranger could get there first. Leave them unset and whoever opens the page first becomes the admin. You add everyone else in **Admin Panel > Users**. Turn `enable_signup` on and new accounts are `pending` until an admin approves them; set `default_user_role = "user"` to skip the approval.

**Which models people see.** An admin sees every model. A user sees only the models an admin has given them, or a group they're in, in **Admin Panel > Models**; until then their model list is empty. `share_models_with_all_users = true` turns that off and shows everyone everything. `ollama_models` and `openai_models` go a step further and limit what Open WebUI offers at all, admins included.

**Where the chats are.** In the database: by default a SQLite file, `webui.db`, in the Podman volume `open-webui`, which is `/var/lib/containers/storage/volumes/open-webui/_data` on the host. Uploaded files and the vector store for document search are in the same volume. With `database_url`, the chats are in PostgreSQL and the files stay in the volume. Admins can read users' chats from the admin panel; set `ENABLE_ADMIN_CHAT_ACCESS = "false"` in `environment` to stop that.

**What leaves the box.** Prompts go to the model servers you connect, and only those. With Ollama on the same host, that's nowhere. With `openai_base_url`, it's wherever that URL points, so a gateway to a hosted provider sends prompts to that provider. When `openai_base_url` is unset, the circuit turns the OpenAI connection off rather than leaving Open WebUI's default of `api.openai.com` in place. Open WebUI's own outbound features are off: anonymised telemetry and analytics (`ANONYMIZED_TELEMETRY`, `DO_NOT_TRACK`, `SCARF_NO_ANALYTICS`), the update check, sharing chats to the Open WebUI community site, and, with `offline_mode`, downloads from Hugging Face and `pip` installs for tools. Web search, image generation and direct connections are off by default in Open WebUI and the circuit leaves them that way. The host still needs to reach its package mirror and `ghcr.io` to install Podman and pull the image.

**Settings come from code.** `persistent_config = false` sets Open WebUI's `ENABLE_PERSISTENT_CONFIG` to `false`, so each start takes its settings from the environment the circuit writes, not from the database. An admin can still change a setting in the admin panel, and it takes effect, but the next restart puts back what the circuit says. Users, groups, model access, chats and files are data, not settings, and are kept. Set `persistent_config = true` if you'd rather manage settings in the admin panel; Open WebUI then reads most environment variables only on its very first start.

`WEBUI_SECRET_KEY`, which signs every session, is made on the host by the first apply. It never passes through Conn3x, so it's in neither your plan nor your state, and it doesn't change, so a restart doesn't sign anyone out.

## Why a container

Open WebUI ships as a container image and as a Python package (`pip install open-webui`). This circuit uses the image:

- **It's what upstream builds and tests**, with the embedding and speech models for document search and voice already inside, which is what lets `offline_mode` work from the first start.
- **One pin, checked.** `openwebui_version` and `image_digest` go into the unit together, and Podman pulls by the digest, so a tag that's re-pushed upstream can't change what your hosts run.
- **Upgrades are a diff.** Change both inputs and `conn3x plan` shows the new image in the unit file. The apply restarts Open WebUI on it, and Open WebUI migrates its database as it starts.

It uses the host's network rather than a published port, so it reaches an Ollama, LiteLLM or PostgreSQL that listens only on localhost, and `listen_address` is a real address on the host.

The image is big: about 1.6 GB compressed for amd64, and several times that on disk. Leave 10 GB free for it.

## What it does

On each host, in order:

1. Creates `/etc/open-webui`, mode `0700`, owned by root.
2. If `/etc/open-webui/keys.env` doesn't exist, writes it, mode `0600`, with `WEBUI_SECRET_KEY` as 32 random bytes in hex from `/dev/urandom`. Once the file exists the circuit never touches it again.
3. Through [circuit-podman](/circuits/podman) v0.1.0, installs Podman and runs `ghcr.io/open-webui/open-webui:VERSION@DIGEST` as `open-webui.service`: a Quadlet unit on the host network that reads `keys.env`, with the volume `open-webui` at `/app/backend/data` and the settings above in the unit. `admin_password`, `openai_api_key`, `database_url` and `environment` go to `/etc/containers/env/open-webui.env`, mode `0600`, written from ephemeral values so they never reach the plan or state.
4. Waits up to fifteen minutes for Open WebUI to open its port. On a first start it pulls the image and sets up its database before it listens.

A change to any input restarts Open WebUI.

The admin password stays in the env file, where Open WebUI ignores it once it has any account. Changing `admin_password` later doesn't change the admin's password; do that in Open WebUI. Once the admin exists you can drop `admin_email` and `admin_password` from your configuration, and the next apply rewrites the env file without them.

### What it doesn't do

- It doesn't install Ollama or a gateway. Use circuit-ollama, and circuit-litellm or any OpenAI-compatible API.
- It doesn't set up TLS or a reverse proxy. Open WebUI speaks plain HTTP on `listen_address`.
- It doesn't open a port in a firewall. With the default `listen_address`, nothing outside the host can reach Open WebUI anyway.
- It doesn't back anything up. Back up the `open-webui` volume, and PostgreSQL if you use it (see [circuit-restic](/circuits/restic)).
- It doesn't grant models to users or create groups. Do that in the admin panel.
- Deleting the module leaves Podman, the container, the volume and `/etc/open-webui` in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.50"`, or a host object such as `{ address = "192.168.1.50", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `admin_email` | string | `null` | Email of the first admin, created at startup when Open WebUI has no accounts yet. Set it with `admin_password`. |
| `admin_password` | string, sensitive, ephemeral | `null` | Password of the first admin, at least 8 characters. Ephemeral and sensitive: it reaches the host's env file but never the plan or state. |
| `admin_name` | string | `"Admin"` | Display name of the first admin. |
| `enable_signup` | bool | `false` | Let people create their own accounts from the sign-in page. |
| `default_user_role` | string | `"pending"` | Role of a self-made account: `"pending"` waits for an admin's approval, `"user"` can chat straight away. |
| `share_models_with_all_users` | bool | `false` | Show every model to every user. When false, a user sees only the models an admin gave them or their group. |
| `ollama_base_url` | string | `"http://127.0.0.1:11434"` | Address of the Ollama server. When null, the Ollama connection is off. |
| `ollama_models` | list(string) | `[]` | Ollama models to offer, by full name and tag, such as `["qwen2.5:0.5b"]`. When empty, every model Ollama has. |
| `openai_base_url` | string | `null` | Address of an OpenAI-compatible API, such as `"http://127.0.0.1:4000/v1"`. When null, the OpenAI connection is off. |
| `openai_api_key` | string, sensitive, ephemeral | `null` | API key for `openai_base_url`. Ephemeral and sensitive, like `admin_password`. |
| `openai_models` | list(string) | `[]` | Model IDs to offer from `openai_base_url`. Open WebUI lists exactly these without asking the server. When empty, whatever the server lists. |
| `database_url` | string, sensitive, ephemeral | `null` | PostgreSQL URL, such as `"postgresql://openwebui:PASSWORD@127.0.0.1:5432/openwebui"`. When null, SQLite in the volume. Ephemeral and sensitive. |
| `persistent_config` | bool | `false` | Let settings changed in the admin panel outlive a restart. |
| `offline_mode` | bool | `true` | Open WebUI's `OFFLINE_MODE`: no Hugging Face downloads, no version check and no `pip` installs for tools. |
| `openwebui_version` | string | `"v0.12.5"` | Tag of `ghcr.io/open-webui/open-webui`. Change `image_digest` with it. |
| `image_digest` | string | `"sha256:03443b8d..."` | Digest of the image for `openwebui_version`. Podman pulls by the digest. Find it on the [package page](https://github.com/open-webui/open-webui/pkgs/container/open-webui) or with `skopeo inspect docker://ghcr.io/open-webui/open-webui:TAG`. |
| `listen_address` | string | `"127.0.0.1"` | Address Open WebUI listens on. `"0.0.0.0"` listens on every address. |
| `port` | number | `8080` | Port Open WebUI listens on. |
| `environment` | map(string), sensitive, ephemeral | `{}` | More of Open WebUI's [environment variables](https://docs.openwebui.com/reference/env-configuration), such as `WEBUI_URL` or `ENABLE_ADMIN_CHAT_ACCESS`. Ephemeral and sensitive: they go into the same env file and never the plan or state. The variables that have inputs of their own, and the telemetry and sharing switches the circuit keeps off, aren't allowed here. |

## Outputs

| Name | Description |
| --- | --- |
| `service` | The systemd service that runs Open WebUI, `open-webui.service`. |
| `image` | The image the hosts run, with its tag and digest. |
| `volume` | `open-webui`, the Podman volume to back up. |
| `keys_file` | `/etc/open-webui/keys.env`, which holds `WEBUI_SECRET_KEY`. |

## Requirements

Requires Conn3x v0.6.9 or later and systemd on each host. The image is built for amd64 and arm64. Each host needs to reach its package mirror and `ghcr.io`, and about 10 GB of free disk for the image. `conn3x init` fetches circuit-podman from GitHub.

Open WebUI on its own used under 1 GB of memory in testing. A model in Ollama beside it needs its own memory on top.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-openwebui/tree/v0.1.0/examples/local) to each on amd64 and checks that the second plan has no changes. It then checks `/health`, signs in as the admin the circuit created through `/api/v1/auths/signin`, and checks that `/api/v1/auths/signup` refuses a new account with 403. It starts a stand-in OpenAI-compatible server and checks that `/api/models` lists its model. It restarts Open WebUI and checks that the session token from before still works and the admin can still sign in, which needs both `WEBUI_SECRET_KEY` and the database to come through, and that the plan is still clean. CI doesn't run Ollama: the runners have no GPU, and the stand-in shows the connection works without a model download.

The same checks passed by hand on two droplets. On Ubuntu 24.04 with 4 GB of memory, Open WebUI ran beside circuit-ollama with `qwen2.5:0.5b` and kept its data in PostgreSQL from circuit-postgres through `database_url`; `/api/models` listed the model and a chat through `/api/chat/completions` got an answer. On Rocky Linux 10 with 2 GB of memory and SELinux enforcing, it ran on SQLite with the stand-in server. On both, port 8080 didn't answer from outside, Open WebUI used about 700 MB of memory, and after a reboot it came back on its own, the admin could sign in, and the second plan was clean. The Rocky audit log had no denials.

Upgrading from one `openwebui_version` to the next hasn't been tried yet.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-openwebui/blob/v0.1.0/LICENSE). Open WebUI itself is under its own [Open WebUI License](https://github.com/open-webui/open-webui/blob/main/LICENSE), a BSD-3-Clause license with a branding clause.

## Source

- Repository: [conn3xorg/circuit-openwebui](https://github.com/conn3xorg/circuit-openwebui). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-openwebui/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-openwebui/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-openwebui/tree/v0.1.0/examples/local).
- Related circuits: [Ollama](/circuits/ollama), [Caddy](/circuits/caddy), [PostgreSQL](/circuits/postgres), [Podman](/circuits/podman), [restic](/circuits/restic), [Qdrant](/circuits/qdrant), [LiteLLM](/circuits/litellm), [Presidio](/circuits/presidio), [Langfuse](/circuits/langfuse), [Agent box](/circuits/agentbox).
