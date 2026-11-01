---
title: Flux
description: "Flux CD on a k3s cluster at a pinned version, synced from a Git repository you name, with credentials kept out of state."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-flux at v0.1.1. -->

[![Conn3x grade](https://conn3x.org/circuits/flux/grade.svg)](https://conn3x.org/circuits/flux/grade)

A Conn3x circuit that installs [Flux](https://fluxcd.io) on a k3s cluster and points it at a Git repository you name. Everything after that happens in Git: push a manifest, and it reaches the cluster without anyone running an apply.

It's for the cluster you've already built with [circuit-k3s](/circuits/k3s), and for the step `flux bootstrap` usually handles. Bootstrap wants write access to your repository and commits Flux's own manifests into it. This circuit installs Flux from one pinned, checksummed release file and only ever reads your repository, so a read-only deploy key is enough.

## Usage

```hcl
module "k3s" {
  source = "github.com/conn3xorg/circuit-k3s?ref=v0.1.4"

  servers              = { cp1 = "203.0.113.10" }
  token                = var.k3s_token
  ssh_private_key_file = "~/.ssh/id_ed25519"
}

module "flux" {
  source     = "github.com/conn3xorg/circuit-flux?ref=v0.1.1"
  depends_on = [module.k3s]

  server               = "203.0.113.10"
  ssh_private_key_file = "~/.ssh/id_ed25519"

  git_url  = "https://git.example.org/me/cluster.git"
  git_path = "./clusters/home"
}

variable "k3s_token" {
  type      = string
  ephemeral = true
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.` The apply waits until Flux has read the repository and applied what's at `git_path`, so a wrong URL, a refused key or a broken manifest fails the apply, after up to five minutes, with Flux's own message.

To try it on a throwaway container first, with a small Git server and no account anywhere, see [examples/local](https://github.com/conn3xorg/circuit-flux/tree/v0.1.1/examples/local).

### A private repository

Credentials go in ephemeral variables, so they never reach state or a plan. Pass them at run time.

Over SSH, with a deploy key:

```hcl
git_url             = "ssh://git@git.example.org/me/cluster.git"
git_auth            = "ssh"
git_ssh_private_key = var.git_key
git_known_hosts     = "git.example.org ssh-ed25519 AAAA..."
```

```sh
export TF_VAR_git_key="$(cat deploy_key)"
```

`git_known_hosts` is required, because Flux refuses SSH without it. `ssh-keyscan git.example.org` prints it, and it's worth checking against what your Git host publishes. Write `git@host:me/cluster.git` as `ssh://git@host/me/cluster.git`.

Over HTTPS, with a password or token:

```hcl
git_url      = "https://git.example.org/me/cluster.git"
git_auth     = "https"
git_username = "flux"
git_password = var.git_token
```

If the server's certificate comes from a private CA, put that CA's certificate in `git_ca_cert`.

## Security

Whoever can push to the branch runs anything they like on this cluster, because Flux's controllers are cluster-admin. Protect that branch the way you'd protect the cluster.

The key or password is never in state, in a plan or on a command line. It does live in two places on purpose: in a root-only file under `/etc/rancher/flux/git/` on the server, which the Secret is built from, and in the `flux-system` Secret in the `flux-system` namespace, which is where Flux reads it. Anyone with admin on the cluster can read it there. `git_url`, `git_username`, `git_known_hosts` and `git_ca_cert` do go into state, and `git_url` refuses a password written into it.

The release file's checksum covers the file. The file names each controller's image by tag, as Flux publishes it, so the images themselves come from `ghcr.io` unverified by this circuit.

## What it does

On the server you name, in order:

1. Checks that the k3s installed there is on `k3s_minors`, and stops with a message if it isn't. The check runs on every plan, so a later k3s upgrade past Flux's range shows up too.
2. Downloads the release's `install.yaml` to `/var/lib/conn3x-flux`, checking its SHA-256. It's the same file for every architecture, so there's no `flux` command to install on the host. You can still run one from your own machine.
3. Applies it server-side and waits for the controllers to roll out.
4. With credentials, writes them under `/etc/rancher/flux/git/`, mode `0600`, and creates the `flux-system` Secret from them. With `git_auth = "none"`, it removes that Secret if there is one.
5. Writes `/etc/rancher/flux/sync.yaml`, with a `GitRepository` and a `Kustomization`, both named `flux-system`, and applies it.
6. Asks Flux to reconcile now rather than at its next interval, and waits for both to be ready.

After that Flux does the rest. It checks the repository every `interval` and applies what it finds. With `prune` on, the default, it also deletes from the cluster what you delete from the repository. Conn3x doesn't watch any of that, so a commit never shows up in a plan, and a bad commit shows up in `kubectl -n flux-system get kustomization` rather than in Conn3x.

`git_path` is a plain directory of manifests, or a Kustomize overlay if it has a `kustomization.yaml`. For anything fancier, commit your own `GitRepository` and `Kustomization` objects there, and these two will apply them.

### k3s versions

Flux supports the three newest Kubernetes minors. v2.10.0 asks for 1.35.2, 1.36.1 or 1.37.0 at the least, and circuit-k3s's default, v1.37.1+k3s1, is in range. `k3s_minors` checks the minor only, so stay on a patch at or above those.

Flux uses neither Traefik nor k3s's Helm controller, and needs no ingress: its controllers call out to your Git server. If your manifests bring an `Ingress` that expects Traefik, that issue is still yours to watch for.

### What it doesn't do

- It doesn't install k3s. Use circuit-k3s, or any k3s whose binary is at `k3s` in the `PATH`.
- It doesn't commit anything to your repository, or set up image automation or notifications. The release file does install those controllers, along with Helm's, so they're there when you commit the objects that use them.
- It doesn't open firewall ports. Flux only needs to reach your Git server and `ghcr.io`.
- Deleting the module leaves Flux running, and what it deployed. [Flux's docs](https://fluxcd.io/flux/installation/) cover removing it.

### Upgrading

Set `flux_version`, `install_sha256` and `k3s_minors` together, reading the supported versions from that release's notes. The checksum is the `install.yaml` line of the release's `flux_VERSION_checksums.txt`. Read the release's breaking changes first. Conn3x re-applies the file, and a Flux upgrade can need more than that.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `server` | any | Required | One k3s server to run `kubectl` on: an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. |
| `git_url` | string | Required | Repository Flux watches, as an `ssh://`, `https://` or `http://` URL. It goes into state, so it can't hold a password. |
| `git_branch` | string | `"main"` | Branch to follow. |
| `git_path` | string | `"./"` | Directory in the repository to reconcile. |
| `git_auth` | string | `"none"` | How Flux logs in: `"none"`, `"ssh"` or `"https"`. |
| `git_ssh_private_key` | string, ephemeral | `null` | Private key for `git_auth = "ssh"`. |
| `git_known_hosts` | string | `""` | known_hosts lines for the Git server. Required for `git_auth = "ssh"`. |
| `git_username` | string | `"git"` | User name for `git_auth = "https"`. |
| `git_password` | string, ephemeral | `null` | Password or token for `git_auth = "https"`. |
| `git_ca_cert` | string | `""` | PEM certificate of a private CA, for `git_auth = "https"`. |
| `interval` | string | `"1m"` | How often Flux checks and reconciles, such as `"1m"` or `"1h"`. |
| `prune` | bool | `true` | Delete from the cluster what has been deleted from the repository. |
| `flux_version` | string | `"v2.10.0"` | [Flux release](https://github.com/fluxcd/flux2/releases) to install. |
| `install_sha256` | string | The v2.10.0 checksum | SHA-256 of the release's `install.yaml`. |
| `k3s_minors` | list(string) | `["1.35", "1.36", "1.37"]` | Kubernetes minor versions the server's k3s may run. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |

## Outputs

| Name | Description |
| --- | --- |
| `flux_version` | Flux release installed. |
| `namespace` | Namespace Flux, its `GitRepository` and its `Kustomization` are in, `flux-system`. |

## Requirements

Requires Conn3x v0.6.9 or later, circuit-k3s v0.1.4 or later if that's what built your cluster, a k3s server on a Kubernetes version Flux supports, outbound HTTPS to `github.com` from that server and to `ghcr.io` from the cluster, and a route from the cluster to your Git server.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-flux/tree/v0.1.1/examples/local) to each in a container on amd64, against a Git server on the same host over SSH. It checks that the second plan has no changes and the private key isn't in state, then runs [check.sh](https://github.com/conn3xorg/circuit-flux/blob/v0.1.1/examples/local/check.sh): the repository's ConfigMaps reach the cluster, and a commit that changes one and deletes the other takes effect with no apply. The same four containers also passed by hand on arm64.

The rest was run by hand. On 2 vCPU, 4 GB droplets, Ubuntu 24.04 and Rocky Linux 10 with SELinux enforcing passed the same checks on x86_64, with no SELinux denials on Rocky. After a reboot the plan had no changes, and another commit reached the cluster. A k3s version outside `k3s_minors` stopped the apply with its message on Ubuntu.

In a Rocky Linux 10 container, a wrong SSH key failed the apply with Flux's message, and the right one recovered it. In a Debian 13 container, `git_auth = "https"` worked against a small test server with basic auth, both over plain HTTP and over TLS with a private CA in `git_ca_cert`, and the password wasn't in state.

Not run: more than one node, arm64 on a real host, a real Git hosting service, a `git_path` other than the default, `git_auth = "none"`, `prune = false`, or an upgrade between Flux releases.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-flux/blob/v0.1.1/LICENSE). Flux is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-flux](https://github.com/conn3xorg/circuit-flux). This page covers [v0.1.1](https://github.com/conn3xorg/circuit-flux/tree/v0.1.1); the repository's [tags](https://github.com/conn3xorg/circuit-flux/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-flux/tree/v0.1.1/examples/local).
- Related circuits: [k3s](/circuits/k3s), [Docker](/circuits/docker), [Podman](/circuits/podman), [kubeadm](/circuits/kubeadm), [MicroShift](/circuits/microshift), [Rancher](/circuits/rancher), [containerd](/circuits/containerd), [Nomad](/circuits/nomad), [Helm](/circuits/helm), [Istio](/circuits/istio).
