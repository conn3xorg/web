---
title: Nomad
description: "A HashiCorp Nomad cluster from a pinned release, with an odd server count, gossip encryption and ACLs on, and no secrets in state."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-nomad at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/nomad/grade.svg)](https://conn3x.org/circuits/nomad/grade)

A Conn3x circuit that turns your hosts into a [HashiCorp Nomad](https://developer.hashicorp.com/nomad) cluster: an odd number of servers, and as many clients as you give it. It installs a pinned Nomad release, checks its SHA-256 before using it, and runs Nomad under systemd with its settings in `/etc/nomad.d`. x86_64 and arm64 hosts each get the right build.

You come away with a cluster that has gossip encryption and ACLs on, and neither the gossip key nor any token anywhere in your Conn3x state.

## Nomad's licence

Read this first, because it isn't open source and the rest of this README can't change that.

Nomad 1.7 and later are under the [Business Source License 1.1](https://github.com/hashicorp/nomad/blob/main/LICENSE), from IBM, which owns HashiCorp. This circuit is MPL-2.0, but that only covers the circuit. It contains none of Nomad: each of your hosts downloads Nomad from `releases.hashicorp.com`, and running it there is between you and IBM.

In plain terms, the licence lets you:

- Run Nomad in production for your own organisation, including its internal services and your affiliates under common control.
- Copy, change and redistribute it, on the licence's terms.

It doesn't let you offer Nomad to third parties, hosted or embedded, in order to compete with IBM's paid versions. A competitive offering is one sold to third parties, paid support included, that significantly overlaps what those paid versions do. Products that aren't provided on a paid basis aren't competitive. If you sell a scheduling platform or a hosted Nomad, read the licence and [HashiCorp's FAQ](https://www.hashicorp.com/license-faq), and ask a lawyer rather than this README. Each release turns into MPL-2.0 four years after it's published.

If you need an open source licence today, this circuit isn't the way to get one.

## Usage

```hcl
module "nomad" {
  source = "github.com/conn3xorg/circuit-nomad?ref=v0.1.0"

  servers = {
    server1 = { address = "203.0.113.10", advertise = "10.0.0.10" }
    server2 = { address = "203.0.113.11", advertise = "10.0.0.11" }
    server3 = { address = "203.0.113.12", advertise = "10.0.0.12" }
  }
  clients = {
    worker1 = { address = "203.0.113.20", advertise = "10.0.0.20" }
  }
  gossip_key           = var.gossip_key
  ssh_private_key_file = "~/.ssh/id_ed25519"
}

variable "gossip_key" {
  type      = string
  ephemeral = true
  sensitive = true
}
```

Make a key with `openssl rand -base64 32` and pass it at run time, with `-var gossip_key=...` or `TF_VAR_gossip_key`. It's ephemeral, so it never goes into state or a plan. On the servers it lives in `/etc/nomad.d/20-gossip.json`, readable by root and the `nomad` group.

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

The number of servers has to be odd, and the plan stops if it isn't. Raft needs a majority to elect a leader: three servers survive losing one, and four still survive only one. One server is fine for trying things out, and can't lose any.

`advertise` is the address the other nodes reach a host on. Set it on any host with more than one network, such as a droplet, or Nomad may pick one the others can't reach. If Conn3x and your nodes see the servers on different addresses and you don't use `advertise`, set `join_addresses`.

To try it on throwaway containers first, see [examples/local](https://github.com/conn3xorg/circuit-nomad/tree/v0.1.0/examples/local).

### Your first token

With ACLs on, the API refuses nearly everything until you bootstrap them, which you do once, by hand, so the token lands with you and not in state:

```sh
ssh root@203.0.113.10 nomad acl bootstrap
```

Put the `Secret ID` it prints in your password manager, and use it as `NOMAD_TOKEN`. Nomad won't print it again. To turn ACLs off, set `acl_enabled = false`, and remember that anyone who can reach port 4646 can then run jobs on your clients.

### Running a job

The clients have Nomad's built-in `exec` driver ready, which needs nothing else installed. [examples/local/hello.nomad.hcl](https://github.com/conn3xorg/circuit-nomad/blob/v0.1.0/examples/local/hello.nomad.hcl) is a small job that uses it:

```sh
export NOMAD_ADDR=http://203.0.113.10:4646 NOMAD_TOKEN=...
nomad job run examples/local/hello.nomad.hcl
nomad job status hello
```

### More Nomad settings

`server_config` and `client_config` go into `/etc/nomad.d/50-extra.json` as they are, and Nomad merges them over the circuit's own settings. A change restarts Nomad on the hosts it affects.

```hcl
client_config = {
  client = { node_pool = "gpu" }
}
```

### Upgrading

Set `nomad_version` and `checksums` together. Take the checksums from the release's `SHA256SUMS` file at `releases.hashicorp.com`. Conn3x replaces the binary and restarts Nomad on each host, the servers one at a time, then the clients. Read Nomad's [upgrade guide](https://developer.hashicorp.com/nomad/docs/upgrade) for the release first.

## What it does

On each server, in order:

1. Installs `curl` and `unzip`, and creates the `nomad` user and group.
2. Downloads the Nomad zip for the host's architecture to `/opt/nomad`. If the checksum doesn't match `checksums`, the apply fails and the old binary stays.
3. Installs the binary to `/usr/local/bin/nomad`.
4. Writes `/etc/nomad.d/10-agent.json`, with `bootstrap_expect` set to the number of servers and `retry_join` set to their addresses, the gossip key file, and `50-extra.json`.
5. Writes `/etc/systemd/system/nomad.service`, the unit HashiCorp's packages install, running as the `nomad` user with a five-minute start timeout.
6. Starts Nomad now and at boot, and waits for it to listen on port 4646.

Once the servers are up, each client does the same, with `iproute` added, since a client won't start without the `ip` command. Clients run as root, because they start your jobs. A change to the binary or the settings restarts Nomad. Servers restart one at a time, each waiting until the last is back.

Before the circuit runs, the `conn3x_host` data source reads each host's architecture over SSH. `x86_64` and `aarch64` are supported; others fail the plan.

### What it doesn't do

- It doesn't set up TLS. The gossip key encrypts the servers' gossip and nothing else: RPC and the HTTP API stay in the clear, and Nomad warns about it each time it starts. Keep the nodes on a private network, or put certificates on the hosts yourself and turn on the [`tls` block](https://developer.hashicorp.com/nomad/docs/configuration/tls) through `server_config` and `client_config`.
- It doesn't open firewall ports or close them. Nomad listens on every address by default. Between nodes it needs TCP 4647 to the servers and TCP and UDP 4648 between servers. You reach the API and web UI on TCP 4646. Don't leave those open to the internet.
- It doesn't install Docker, the CNI plugins that bridge networking needs, or Consul.
- It doesn't rotate the gossip key. Nomad reads `encrypt` only on a server's first start, and keeps the key in its data directory, so changing `gossip_key` later updates the file and restarts the servers without changing the key they use. Rotate with `nomad operator gossip keyring`.
- It doesn't bootstrap ACLs, as above.
- Deleting the module leaves Nomad installed and running.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `servers` | any | Required | Server nodes, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `advertise`, `user`, `port`, `private_key_file` and `jump_hosts`. There must be an odd number. |
| `clients` | any | `{}` | Client nodes, which run your jobs, by name, in the same form. A name can't be both a server and a client. |
| `gossip_key` | string, ephemeral, sensitive | Required | 32 bytes in base64 that encrypt the servers' gossip. |
| `join_addresses` | list(string) | `null` | Addresses nodes use to find the servers. When null, each server's `advertise`, or else its address. |
| `acl_enabled` | bool | `true` | Turn on Nomad's ACLs. |
| `datacenter` | string | `"dc1"` | Datacenter the nodes belong to. |
| `server_config` | any | `{}` | More agent settings for the servers. |
| `client_config` | any | `{}` | More agent settings for the clients. |
| `nomad_version` | string | `"2.1.1"` | Nomad release to install, without the `v`. |
| `checksums` | map(string) | The 2.1.1 checksums | SHA-256 of the `amd64` and `arm64` zips. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |

## Outputs

| Name | Description |
| --- | --- |
| `join_addresses` | Addresses the nodes use to find the servers. |
| `nomad_version` | Nomad release the circuit installs. |

## Requirements

Requires Conn3x v0.6.10 or later, systemd on each host, and outbound HTTPS to `releases.hashicorp.com`.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-nomad/tree/v0.1.0/examples/local) to a server and a client of each, checks that the second plan has no changes and that the gossip key stayed out of state, then bootstraps ACLs, checks an anonymous request gets a 403, runs [hello.nomad.hcl](https://github.com/conn3xorg/circuit-nomad/blob/v0.1.0/examples/local/hello.nomad.hcl) with the `exec` driver and reads the job's output back from the client. A second CI job does the same with three servers and a client, and a third checks that an even number of servers is refused. Those runs were also done by hand in containers on arm64.

The same check passed on five droplets on a private network: servers on Ubuntu 24.04, Rocky Linux 10 and Debian 13, clients on Ubuntu 24.04 and Rocky Linux 10, with `advertise` set. SELinux was enforcing on the Rocky hosts, with no denials for Nomad. After rebooting two of the servers and a client, one at a time, the cluster had three peers and a leader, and the plan stayed clean. Changing `nomad_version` replaced the binary everywhere and the second plan was clean; that was tried between 2.1.1 and 2.1.0, both ways, not on a real upgrade across minor versions. Fedora 45 wasn't available as a droplet, so it has only run in containers, with SELinux off.

## License

The circuit is MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-nomad/blob/v0.1.0/LICENSE). Nomad itself is BUSL-1.1, as [above](#nomads-licence).

## Source

- Repository: [conn3xorg/circuit-nomad](https://github.com/conn3xorg/circuit-nomad). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-nomad/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-nomad/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-nomad/tree/v0.1.0/examples/local).
- Related circuits: [Docker](/circuits/docker), [Podman](/circuits/podman), [k3s](/circuits/k3s), [kubeadm](/circuits/kubeadm), [MicroShift](/circuits/microshift), [Rancher](/circuits/rancher), [containerd](/circuits/containerd), [Helm](/circuits/helm), [Istio](/circuits/istio), [Flux](/circuits/flux).
