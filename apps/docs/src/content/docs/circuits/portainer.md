---
title: Portainer CE
description: "Portainer CE and its agent under Podman, HTTPS on loopback, the admin set before anyone else can claim it."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-portainer at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/portainer/grade.svg)](https://conn3x.org/circuits/portainer/grade)

A Conn3x circuit that runs [Portainer Community Edition](https://www.portainer.io) on your hosts: the web UI for looking after containers, their images, volumes and networks, and for deploying stacks, without typing `podman` over SSH. It can also run the Portainer agent, so one Portainer server looks after several hosts.

Both run from Portainer's official images under Podman as systemd services, pinned by tag and digest. The server listens on `127.0.0.1:9443`, HTTPS only, for an SSH tunnel or a reverse proxy in front. The first apply creates the admin account from a password you pass at run time, so nobody can claim the instance before you open it. It runs on Debian, Ubuntu, Fedora and Rocky Linux.

## Podman, not Docker

Portainer manages the host's **Podman**, through Podman's Docker-compatible API socket, `/run/podman/podman.sock`. The circuit turns that socket on and mounts it into the containers where Portainer looks for Docker's. Portainer has supported Podman environments since 2.20. Swarm, which needs Docker, isn't there.

You don't need Docker, and this circuit doesn't install it. If a host already runs Docker, from [circuit-docker](/circuits/docker) or elsewhere, this circuit isn't the way to put Portainer on it: Portainer would see Podman's containers, not Docker's. Running both engines on one host is rarely what you want anyway.

Portainer's own docs name CentOS Stream 9 with Podman 5 as the setup they support. Rocky Linux 10, Fedora 45 and Debian 13 ship Podman 5, and Ubuntu 24.04 ships Podman 4.9. All four pass the checks under [Tested on](#tested-on), but Portainer doesn't promise Ubuntu's older Podman.

## Usage

```hcl
variable "portainer_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "portainer" {
  source = "github.com/conn3xorg/circuit-portainer?ref=v0.1.0"

  hosts                = { apps = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  admin_password = var.portainer_password
}
```

Then run `conn3x init` and `conn3x apply` with the password in the environment:

```sh
export TF_VAR_portainer_password='...'
conn3x apply
```

A second `conn3x plan` says `No changes.` Every plan needs the password too, since Conn3x checks the file it's kept in on the host against it. Portainer wants at least 12 characters, and the circuit checks that before it connects to anything.

Reach the UI over SSH: `ssh -L 9443:127.0.0.1:9443 root@192.168.1.50`, then open `https://localhost:9443` and sign in as `admin`. Your browser warns about the certificate the first time. Portainer made it for itself on its first start, and it's in `/var/lib/portainer/data/certs` if you'd like to check its fingerprint.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-portainer/tree/v0.1.0/examples/local).

### Behind a reverse proxy

For a name and a real certificate, put a proxy in front, such as [circuit-caddy](/circuits/caddy) on the same host. Portainer only speaks HTTPS here, so the proxy talks HTTPS to it and skips the check of Portainer's self-signed certificate on that loopback hop:

```hcl
module "caddy" {
  source = "github.com/conn3xorg/circuit-caddy?ref=v0.3.0"

  hosts                = { apps = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  sites = {
    "portainer.example.com" = {
      extra = "reverse_proxy https://127.0.0.1:9443 {\n  transport http {\n    tls_insecure_skip_verify\n  }\n}"
    }
  }
}
```

Skipping the check is only safe because that hop never leaves the host.

### More hosts, with the agent

One server can look after many hosts. On each of the others, run only the agent, listening on an address the server can reach:

```hcl
variable "agent_secret" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "portainer_server" {
  source = "github.com/conn3xorg/circuit-portainer?ref=v0.1.0"

  hosts                = { apps = "10.0.0.5" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  admin_password = var.portainer_password
  agent_secret   = var.agent_secret
}

module "portainer_agent_web1" {
  source = "github.com/conn3xorg/circuit-portainer?ref=v0.1.0"

  hosts                = { web1 = "10.0.0.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  server               = false
  agent                = true
  agent_listen_address = "10.0.0.11"
  agent_secret         = var.agent_secret
}
```

`agent_listen_address` is one address for every host in a module, so each agent host gets its own module, or you use `"0.0.0.0"` with a firewall that only lets the server in on port 9001. Then add each host in Portainer under **Environments**, **Add environment**, as an agent at `10.0.0.11:9001`. The `agent_address` output gives that address.

`agent_secret` sets `AGENT_SECRET` on the server and the agents. Without it, an agent belongs to the first Portainer server that connects to it, and an agent nobody has claimed stops after 72 hours (systemd starts it again). With it, an agent only answers a server holding the same secret. The agent speaks TLS with a certificate it makes for itself; it doesn't need a proxy.

## What it does

On each host, in order:

1. Installs Podman and turns on `podman.socket`, the Docker-compatible API Portainer talks to.
2. With `agent`, creates `/var/lib/containers/storage/volumes` if Podman hasn't yet, since the agent mounts it.
3. With `server`, creates `/etc/portainer`, mode `0700`, and writes `admin_password` to `/etc/portainer/admin_password`, mode `0600`, write-only: the plan and state hold an HMAC of it, never the password. Creates `/var/lib/portainer/data` in a parent only root can enter.
4. Through [circuit-podman](/circuits/podman) v0.1.0, runs `docker.io/portainer/portainer-ce:VERSION@DIGEST` as `portainer.service` and, with `agent`, `docker.io/portainer/agent:VERSION@DIGEST` as `portainer-agent.service`. Both are Quadlet units on the host's network with Podman's socket mounted. `agent_secret` goes to `/etc/containers/env/NAME.env`, mode `0600`, from an ephemeral value.
5. Waits up to 10 minutes for the server's and the agent's ports to open, on the first apply and again after any change that restarts them, so the apply finishes with Portainer answering.

The server starts with `--http-disabled --bind-https LISTEN:PORT --tunnel-addr LISTEN --tunnel-port TUNNEL_PORT --admin-password-file ... -H unix:///var/run/docker.sock`. So HTTP stays off, the Edge tunnel listens on `listen_address` like the UI, the admin is created on the first start, and the host's own Podman is Portainer's first environment.

A change to an input restarts the containers it touches.

### Who can do what

Anyone who signs in to Portainer as an admin can start a privileged container with the host's `/` mounted, which makes them root on the host. The same is true of whoever reaches an unclaimed agent first. That's what managing a container engine means, not a flaw in Portainer, but it's why the defaults keep everything on `127.0.0.1`, why the admin is created by the apply, and why `agent_secret` exists. Treat the admin password like the host's root password.

The containers run with SELinux separation off (`SecurityLabelDisable=true`), since Podman's socket is labelled for Podman alone. A container holding that socket can already do anything on the host, so the label wouldn't hold it back.

### Upgrades

Change `portainer_version`, `image_digest` and `agent_image_digest` together. `conn3x plan` shows the new images in the units, and the apply restarts Portainer on them; Portainer migrates its database as it starts. CI applies 2.45.2 first and then upgrades to 2.45.3. Keep the server and agents on the same version.

### What it doesn't do

- It doesn't change the admin password after the first start. Portainer reads the file once. Change it in Portainer under **My account**.
- It doesn't set up TLS with your own certificate or a reverse proxy. Portainer serves its own self-signed certificate.
- It doesn't open a port in a firewall.
- It doesn't run the Edge agent or anything for Kubernetes.
- It doesn't back anything up. Back up `/var/lib/portainer/data` (see [circuit-restic](/circuits/restic)).
- Deleting the module leaves Podman, the containers and `/var/lib/portainer` in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.50"`, or a host object such as `{ address = "192.168.1.50", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `server` | bool | `true` | Run the Portainer server. |
| `agent` | bool | `false` | Run the Portainer agent. |
| `admin_password` | string, sensitive, ephemeral | `null` | Password for the `admin` user, created on the first start. Needed with `server`. At least 12 characters. Ephemeral and sensitive: it reaches a root-only file on the host but never the plan or state. |
| `agent_secret` | string, sensitive, ephemeral | `null` | `AGENT_SECRET` for the server and agent, at least 16 characters. Ephemeral and sensitive, like `admin_password`. |
| `listen_address` | string | `"127.0.0.1"` | Address the server's UI and Edge tunnel listen on. |
| `port` | number | `9443` | Port of the server's HTTPS UI and API. |
| `tunnel_port` | number | `8000` | Port of the server's Edge tunnel. |
| `agent_listen_address` | string | `"127.0.0.1"` | Address the agent listens on. Set an address the server can reach. |
| `agent_port` | number | `9001` | Port the agent listens on. |
| `portainer_version` | string | `"2.45.3"` | Tag of both images. Change both digests with it. |
| `image_digest` | string | `"sha256:3609c307..."` | Digest of `docker.io/portainer/portainer-ce` for `portainer_version`. Find it on [Docker Hub](https://hub.docker.com/r/portainer/portainer-ce/tags) or with `skopeo inspect docker://docker.io/portainer/portainer-ce:TAG`. |
| `agent_image_digest` | string | `"sha256:6e6d2d5d..."` | Digest of `docker.io/portainer/agent` for `portainer_version`. |

## Outputs

| Name | Description |
| --- | --- |
| `services` | The systemd services the circuit runs, `portainer.service` and `portainer-agent.service`. |
| `url` | Where the server answers on the host, such as `https://127.0.0.1:9443`, or null without `server`. |
| `agent_address` | The address to add the agent at in Portainer, such as `10.0.0.11:9001`, or null without `agent`. |
| `images` | The images the hosts run, with tags and digests. |

## Requirements

Requires Conn3x v0.7.0 or later and systemd on each host. The images are built for amd64 and arm64. Each host needs to reach its package mirror and Docker Hub. `conn3x init` fetches circuit-podman from GitHub.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-portainer/tree/v0.1.0/examples/local), a server and an agent on one host, to each on amd64. It applies Portainer 2.45.2 first and checks it, then upgrades to 2.45.3 and checks that the next plan has no changes. Through an SSH tunnel, trusting only Portainer's own certificate, the check signs in as admin and sees a wrong password refused, lists the host's containers through Podman's socket, adds the agent as a second environment and reads the engine's details through it. The passwords aren't in state. Then CI restarts the host, runs the check again and plans clean.

By hand, on two DigitalOcean droplets with 2 GB of memory, Ubuntu 24.04 and Rocky Linux 10 with SELinux enforcing, each running this circuit next to circuit-passbolt and circuit-semaphore: the same upgrade from 2.45.2, the same checks with `agent_secret` set, a reboot after which everything came back on its own, checked again and planned clean. The Rocky audit log had no SELinux denials, and no password or secret was in state.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-portainer/blob/v0.1.0/LICENSE).

Portainer Community Edition is under the [zlib licence](https://github.com/portainer/portainer/blob/develop/LICENSE). Portainer is a trademark of Portainer.io; this circuit isn't affiliated with Portainer.io.

## Source

- Repository: [conn3xorg/circuit-portainer](https://github.com/conn3xorg/circuit-portainer). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-portainer/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-portainer/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-portainer/tree/v0.1.0/examples/local).
- Related circuits: [Docker](/circuits/docker), [Caddy](/circuits/caddy), [Podman](/circuits/podman), [restic](/circuits/restic), [k3s](/circuits/k3s), [kubeadm](/circuits/kubeadm), [MicroShift](/circuits/microshift), [Rancher](/circuits/rancher), [containerd](/circuits/containerd), [Nomad](/circuits/nomad), [Helm](/circuits/helm), [Istio](/circuits/istio), [Flux](/circuits/flux), [Dockge](/circuits/dockge).
