---
title: Teleport
description: "A Teleport Community Edition cluster from Teleport's signed repository: auth and proxy on one host, SSH nodes joining over a reverse tunnel with an expiring token."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-teleport at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/teleport/grade.svg)](https://conn3x.org/circuits/teleport/grade)

A Conn3x circuit that installs Teleport Community Edition from Teleport's signed package repository and builds a small cluster: the auth and proxy services on one host, and SSH nodes that join it. Once it's applied, you log in to the proxy once, and `tsh ssh` takes you to any node, with short-lived certificates instead of keys copied around, and every session recorded on the server.

Nodes connect out to the proxy over a reverse tunnel, so they need no open port, and a box behind NAT at home joins the same way as a VPS. The join token comes in through an ephemeral variable, so it never lands in state or a plan.

## Usage

Apply the server first, then the nodes, with the same token:

```hcl
module "teleport_server" {
  source = "github.com/conn3xorg/circuit-teleport?ref=v0.1.0"

  hosts                = { bastion = "203.0.113.10" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  role               = "server"
  public_addr        = "teleport.example.com:443"
  web_listen_address = "203.0.113.10:443"
  https_cert_file    = "/etc/letsencrypt/live/teleport.example.com/fullchain.pem"
  https_key_file     = "/etc/letsencrypt/live/teleport.example.com/privkey.pem"

  join_token = var.teleport_join_token
}

module "teleport_nodes" {
  source = "github.com/conn3xorg/circuit-teleport?ref=v0.1.0"

  hosts                = { nas = "192.168.1.20", pve = "192.168.1.30" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  role          = "node"
  proxy_address = "teleport.example.com:443"
  labels        = { site = "home" }

  join_token = var.teleport_join_token

  depends_on = [module.teleport_server]
}

variable "teleport_join_token" {
  type      = string
  ephemeral = true
}
```

A join token is at least 32 letters, digits, `_` or `-`. Make one and pass it at run time:

```sh
export TF_VAR_teleport_join_token=$(openssl rand -hex 24)
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

The server has no users yet. Make yourself one on it, and open the link it prints to set a password and a second factor:

```sh
ssh root@203.0.113.10 tctl users add james --roles=editor,access --logins=root,james
```

Then, from your own machine:

```sh
tsh login --proxy=teleport.example.com --user=james
tsh ls
tsh ssh root@nas
```

To try it on two throwaway containers first, see [examples/local](https://github.com/conn3xorg/circuit-teleport/tree/v0.1.0/examples/local).

### The proxy's certificate

Users and nodes check the proxy's certificate, so it has to be one they trust, for the name in `public_addr`:

- **A public certificate**, such as one from Let's Encrypt. [circuit-certbot](/circuits/certbot) can get one on the server; pass its paths as `https_cert_file` and `https_key_file`.
- **Your own CA**, which suits a homelab with names that only resolve inside it. Pass the CA's certificate as `proxy_ca` to the server and the nodes, and the circuit adds it to each host's trust store. Your own machine needs to trust it too, for `tsh`.

Without a certificate, Teleport makes a self-signed one. Browsers warn, and nodes refuse to join through it, so that's only good for a look at the web UI.

### The join token, and join = false

The server stores the token as a provision token for the node role, which Teleport deletes after `join_token_ttl` hours, 24 by default. Nodes read it from `/etc/teleport/join-token` when they first start, then hold an identity of their own in `/var/lib/teleport` and don't need the token again.

While `join` is true, every plan needs `join_token`. Once your nodes have joined:

1. Set `join = false` on both modules and apply. Conn3x deletes the token files from the hosts. The nodes stay in the cluster.
2. From then on, plan and apply without a token.

To add a node later, set `join = true` with a fresh token for that apply, on the server and the new node, then back to false. A new token on the server makes a new provision token; the old one runs out on its own.

## What it does

Before the circuit runs, the `conn3x_host` data source reads each host's distribution over SSH. Then, on each host:

1. Installs `curl` and `ca-certificates`. With `proxy_ca`, adds it to the trust store with `update-ca-certificates` or `update-ca-trust`.
2. Adds Teleport's repository for the channel of `teleport_version`'s major release, `stable/v18` today: `apt.releases.teleport.dev` on Debian and Ubuntu, and the RHEL repository on `yum.releases.teleport.dev` for Rocky Linux, AlmaLinux and RHEL, as Teleport's own installer picks. The signing key is in [files](https://github.com/conn3xorg/circuit-teleport/tree/v0.1.0/files).
3. Installs `teleport` at `teleport_version`.
4. With `join`, writes the token to `/etc/teleport`, mode `0600`.
5. Writes `/etc/teleport.yaml`, mode `0600`, after checking it with `teleport configure --test`. A file Teleport would refuse never replaces the old one. A change restarts Teleport.
6. Keeps `teleport.service` enabled and running, and waits for its readiness check on `127.0.0.1:3434` to pass.
7. On the server, with `join`, creates the provision token with `tctl`, once and again whenever the token or `join_token_ttl` changes.

On the server, `/etc/teleport.yaml` turns on the auth, proxy and SSH services. The proxy listens on `web_listen_address` in multiplex mode, so the web UI, `tsh`, nodes and the auth API share that one port. Auth listens on `127.0.0.1:3025` and the server's own SSH service on `127.0.0.1:3022`, for the proxy alone. On a node, only the SSH service runs, and it reaches the cluster through `proxy_address`. Every host is named in the cluster by its key in `hosts`.

### Upgrades

Change `teleport_version` and apply. Conn3x installs that release and restarts Teleport. CI does this from 18.11.7 to 18.11.8 and reaches the node again afterwards. Upgrade the server before the nodes, and don't skip a major version: Teleport supports nodes one major version behind the server, not ahead. A new major version also moves the repository to its own channel.

The circuit doesn't hold the package, so a routine `apt upgrade` or `dnf upgrade` can move Teleport past `teleport_version` within the channel. The next plan then shows the difference.

### The signing key

The key in `files/teleport.asc` is the one Teleport signs both its apt and yum repositories with, fingerprint `0C5E 8BA5 658E 320D 1B03 1179 C87E D53A 6282 C411`, downloaded from `apt.releases.teleport.dev/gpg`. It expires on 20 October 2030. When Teleport rotates it, a new release of this circuit will carry the new key.

### What it doesn't do

- **Fedora.** Teleport publishes no Fedora repository, and its installer falls back to a tarball there, so the plan stops on Fedora hosts.
- **Users, roles and SSO.** Make users with `tctl users add`, and set up GitHub or OIDC login as Teleport's docs describe. The circuit leaves them alone.
- **More than one auth server.** High availability needs a shared backend, which is beyond one host.
- **Databases, Kubernetes, apps and desktops.** Only the SSH service runs on nodes.
- **The host firewall.** Open `web_listen_address`'s port on the server. Nodes need nothing open.
- **Changing a cluster's name.** `cluster_name` is fixed once the server has started; changing it later breaks the cluster.
- Deleting the module leaves Teleport installed and running.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`. The two forms can be mixed. Each host's key is its name in the cluster. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `role` | string | Required | `"server"` for auth and proxy on one host, or `"node"`. |
| `teleport_version` | string | `"18.11.8"` | Teleport Community Edition release to install. |
| `public_addr` | string | `null` | Server only, required there. Name and port users and nodes reach the proxy on, such as `"teleport.example.com:443"`. |
| `web_listen_address` | string | `null` | Server only, required there. IP address and port the proxy listens on, such as `"192.168.1.40:443"`. |
| `cluster_name` | string | `null` | Server only. The cluster's name, fixed once the server starts. When null, the name in `public_addr`. |
| `https_cert_file` | string | `null` | Server only. Path on the host to the proxy's certificate chain. |
| `https_key_file` | string | `null` | Server only. Path on the host to its key. Set with `https_cert_file`. |
| `proxy_address` | string | `null` | Node only, required there. The server's `public_addr`. |
| `proxy_ca` | string | `null` | PEM certificate of a private CA that signed the proxy's certificate, for each host's trust store. |
| `join` | bool | `true` | Server: create `join_token` as a provision token. Node: join with it. |
| `join_token` | string, sensitive, ephemeral | `null` | The join token, at least 32 letters, digits, `_` or `-`. Ephemeral and sensitive. Required when `join` is true. |
| `join_token_ttl` | number | `24` | Server only. Hours the token works for, from when the server creates it, 1 to 720. |
| `labels` | map(string) | `{}` | Labels for the SSH service on every host, such as `{ env = "homelab" }`. |

The `os` in a host object, one of `debian`, `ubuntu`, `rocky`, `almalinux` or `rhel`, stands in for the facts of a host created in the same plan.

`join` is separate from `join_token` because OpenTofu won't let a step's count depend on an ephemeral value.

## Outputs

| Name | Description |
| --- | --- |
| `service` | The systemd unit Teleport runs as, `teleport.service`. |
| `config_file` | Teleport's config file, `/etc/teleport.yaml`. |

## Requirements

Requires Conn3x v0.7.0 or later and systemd on each host, with outbound HTTPS to apt.releases.teleport.dev or yum.releases.teleport.dev. Nodes need to reach the server's `public_addr`. Teleport builds packages for x86_64 and aarch64.

## Tested on

Rocky Linux 10, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-teleport/tree/v0.1.0/examples/local), a server and a node in two containers with a throwaway CA, first at Teleport 18.11.7, then upgrades both to 18.11.8. After each apply it checks that the second plan has no changes. It makes a user on the server and runs a command on the node through the proxy with `tsh ssh`, checks the node's labels reach the cluster, checks the token stayed out of state, restarts both hosts and reaches the node again, then switches `join` off, checks both token files are gone, and reaches the node once more. The CI containers run with SELinux off. The same steps also passed by hand on two droplets, an Ubuntu 24.04 server and a Rocky Linux 10 node with SELinux enforcing and no denials in the audit log, including a reboot of both followed by a clean plan. There the token showed in `tctl tokens ls` with an expiry 24 hours out.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-teleport/blob/v0.1.0/LICENSE). Teleport's source is AGPL-3.0, and the packages this circuit installs are under the Teleport Community Edition license: free for personal use and for companies with fewer than 100 employees and less than $10 million in annual revenue. Check it fits before you deploy it at work.

## Source

- Repository: [conn3xorg/circuit-teleport](https://github.com/conn3xorg/circuit-teleport). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-teleport/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-teleport/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-teleport/tree/v0.1.0/examples/local).
- Related circuits: [certbot](/circuits/certbot), [Users](/circuits/users), [LLDAP](/circuits/lldap), [OpenLDAP](/circuits/openldap), [FreeIPA](/circuits/freeipa), [Keycloak](/circuits/keycloak), [OpenBao](/circuits/openbao), [Infisical](/circuits/infisical), [authentik](/circuits/authentik), [Passbolt CE](/circuits/passbolt).
