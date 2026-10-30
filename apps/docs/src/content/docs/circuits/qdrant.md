---
title: Qdrant
description: "Runs the Qdrant vector database from its official release under systemd, on loopback until you open it, with an optional API key."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-qdrant at v0.1.0. -->

A Conn3x circuit that runs [Qdrant](https://qdrant.tech), the vector database, on your own hosts. It's the self-hosted counterpart to Qdrant Cloud and its Terraform provider: the same database, on a box you already pay for, with your embeddings never leaving it.

It downloads a pinned Qdrant release, checks its SHA-256, and runs it under systemd as its own `qdrant` user. You set the ports, the listen address, where the data lives and an optional API key; the circuit writes `/etc/qdrant/config.yaml` from them and restarts Qdrant when it changes. Out of the box Qdrant listens only on `127.0.0.1` and sends no telemetry, so nothing is reachable from outside until you say so.

If you're building retrieval on local models, it pairs well with [circuit-ollama](/circuits/ollama): Ollama makes the embeddings, Qdrant stores and searches them.

## Usage

```hcl
variable "qdrant_api_key" {
  type      = string
  sensitive = true
}

module "qdrant" {
  source = "github.com/conn3xorg/circuit-qdrant?ref=v0.1.0"

  hosts                = { vectors1 = "203.0.113.10" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  listen_address = "0.0.0.0"
  api_key        = var.qdrant_api_key
}

output "qdrant_urls" {
  value = module.qdrant.urls
}
```

Then run `conn3x init` and `conn3x apply`, with the key in `TF_VAR_qdrant_api_key`. A second `conn3x plan` says `No changes.`

Clients send the key in an `api-key` header:

```sh
curl -H "api-key: $TF_VAR_qdrant_api_key" http://203.0.113.10:6333/collections
```

The key travels in plain HTTP. Across anything but a private network, put Qdrant behind a TLS proxy, such as [circuit-caddy](/circuits/caddy), and keep `listen_address` at `127.0.0.1`.

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry:

```hcl
hosts = {
  for name, d in digitalocean_droplet.vectors : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-qdrant/tree/v0.1.0/examples/local).

## What it does

On each host, in order:

1. Installs `curl`, `tar` and `gzip` if they're missing.
2. Creates the `qdrant` system user, with home `/var/lib/qdrant` and no login shell, and creates `storage_path` and `snapshots_path` owned by it, mode `0750`.
3. Downloads `qdrant-ARCH-unknown-linux-musl.tar.gz` from the GitHub release into `/opt/qdrant/VERSION/` and unpacks the `qdrant` binary there. If the checksum doesn't match `checksums`, the apply fails and nothing is unpacked. The musl build is static, so the same binary runs on every distribution.
4. Writes `/etc/qdrant/config.yaml`, owned by `qdrant` with mode `0600`, and `/etc/systemd/system/qdrant.service`. A change to either restarts Qdrant.
5. Starts Qdrant now and at boot, and waits until its `/readyz` endpoint answers.

The config file is write-only: it reaches the host, but the plan and state hold only an HMAC of it, since it can carry the API key. A change to any input shows in the plan as `content_hmac` changing. See [Secrets](/reference/circuits/secrets) for the HMAC key Conn3x uses.

The unit runs Qdrant with `ProtectSystem=strict`, so it can write only to its home, `storage_path` and `snapshots_path`.

Before the circuit runs, the `conn3x_host` data source reads each host's architecture over SSH. `x86_64` and `aarch64` each get their own build; other architectures fail the plan.

### What it doesn't do

- It doesn't open a firewall port. Open `http_port`, and `grpc_port` if your clients use gRPC, with [circuit-firewall](/circuits/firewall) or a step of your own.
- It doesn't set up TLS, a read-only key, JWT access or clustering. Qdrant supports all four; set them up on top if you need them.
- It doesn't create collections. That's your application's job, over the API.
- It doesn't take backups. Qdrant writes snapshots to `snapshots_path` when you ask it to over the API; copying them somewhere safe is up to you.
- Deleting the module leaves Qdrant installed and running, with its data.

### Upgrading

Set `qdrant_version` and `checksums` together. The release page lists each asset's SHA-256:

```hcl
module "qdrant" {
  source = "github.com/conn3xorg/circuit-qdrant?ref=v0.1.0"

  hosts          = { vectors1 = "203.0.113.10" }
  qdrant_version = "1.20.0"
  checksums = {
    x86_64  = "b03a64616a1f41ddab78b480a318466541765f19835318113b1821cbea8df52c"
    aarch64 = "bd8a458b8ef8006ce2c603c5bd6d1d973e39d787f794008dd959112e747c3bb7"
  }
}
```

The new release unpacks beside the old one, the unit points at it, and Qdrant restarts on the same data. The old directory stays until you remove it. Read Qdrant's release notes before a jump of more than one minor version.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `qdrant_version` | string | `"1.20.0"` | Qdrant release to install, without the leading `v`. |
| `checksums` | map(string) | The 1.20.0 checksums | SHA-256 of the musl release tarball for `x86_64` and `aarch64`. |
| `listen_address` | string | `"127.0.0.1"` | Address the REST and gRPC APIs listen on. `"0.0.0.0"` listens on every address. |
| `http_port` | number | `6333` | Port of the REST API. |
| `grpc_port` | number | `6334` | Port of the gRPC API. |
| `api_key` | string, sensitive | `null` | Key every request must send in an `api-key` header, at least 16 characters. Sensitive, and kept out of state. When null, the APIs take requests without one. |
| `storage_path` | string | `"/var/lib/qdrant/storage"` | Directory Qdrant keeps its collections in. |
| `snapshots_path` | string | `"/var/lib/qdrant/snapshots"` | Directory Qdrant writes snapshots to. |
| `telemetry_disabled` | bool | `true` | Stop Qdrant sending anonymous usage statistics. Set `false` to send them. |

## Outputs

| Name | Description |
| --- | --- |
| `config_file` | Path of the configuration file, `/etc/qdrant/config.yaml`. |
| `urls` | Each host's REST API URL by host name, such as `{ vectors1 = "http://203.0.113.10:6333" }`. With `listen_address` on every address, the host's own address; otherwise `listen_address`. |

## Requirements

Requires Conn3x v0.6.5 or later, systemd on each host, and outbound HTTPS to github.com.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-qdrant/tree/v0.1.0/examples/local) to each on amd64 with an API key, checks that the second plan has no changes, then creates a collection over the REST API, upserts two points, searches and gets the nearer one back, and checks that a request without the key gets `401`.

The same checks passed by hand on an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both with 1 vCPU and 2 GB of memory. Qdrant listened on `127.0.0.1` only and ran as `unconfined_service_t` on Rocky Linux, with no denials in the audit log. After a reboot it came back with the stored point, and the plan had no changes.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-qdrant/blob/v0.1.0/LICENSE). Qdrant itself is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-qdrant](https://github.com/conn3xorg/circuit-qdrant). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-qdrant/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-qdrant/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-qdrant/tree/v0.1.0/examples/local).
- Related circuits: [Ollama](/circuits/ollama), [Caddy](/circuits/caddy), [Firewall](/circuits/firewall), [Agent box](/circuits/agentbox).
