---
title: Rancher
description: "Install Rancher Manager on a k3s cluster with Helm and cert-manager, at pinned versions, with the bootstrap password kept out of state."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-rancher at v0.1.0. -->

A Conn3x circuit that installs [Rancher Manager](https://www.rancher.com) on a k3s cluster, the way Rancher documents it: cert-manager and the Rancher chart, through Helm, at versions you pin. It's for the cluster you've already built with [circuit-k3s](/circuits/k3s), so one configuration takes you from bare hosts to a Rancher login page.

The part that usually bites is the Kubernetes version. Rancher supports a narrow range, and k3s's newest release is often past it: Rancher 2.15.3 stops at Kubernetes 1.36, while circuit-k3s defaults to v1.37. So you pin k3s to a supported release, as below, and this circuit checks the version before it installs anything.

## Usage

```hcl
module "k3s" {
  source = "github.com/conn3xorg/circuit-k3s?ref=v0.1.3"

  servers              = { cp1 = "203.0.113.10" }
  token                = var.k3s_token
  ssh_private_key_file = "~/.ssh/id_ed25519"

  # circuit-k3s defaults to v1.37, which Rancher 2.15 doesn't support.
  k3s_version = "v1.36.5+k3s1"
  checksums = {
    k3s         = "d73847bcd3c5fccef0115b372e2f9a91f3032dc84bbf71518a4617565294d313"
    "k3s-arm64" = "135e34cb9e8a1cfae3cb55577789e93501efe7edc080a8b2630458a85b07721e"
  }
}

module "rancher" {
  source     = "github.com/conn3xorg/circuit-rancher?ref=v0.1.0"
  depends_on = [module.k3s]

  server               = "203.0.113.10"
  hostname             = "rancher.example.org"
  bootstrap_password   = var.rancher_bootstrap_password
  ssh_private_key_file = "~/.ssh/id_ed25519"
}

variable "k3s_token" {
  type      = string
  ephemeral = true
}

variable "rancher_bootstrap_password" {
  type      = string
  ephemeral = true
}
```

Pass both secrets at run time, with `TF_VAR_k3s_token` and `TF_VAR_rancher_bootstrap_password`. Then run `conn3x init` and `conn3x apply`, which takes a few minutes. A second `conn3x plan` says `No changes.`

Open `https://rancher.example.org`, log in as `admin` with the bootstrap password, and Rancher asks you to choose a new one. Do that straight away: until you do, the bootstrap password is the admin password. Your browser will warn about the certificate, since Rancher signs its own by default.

`hostname` has to resolve to your server, or to a load balancer in front of your servers, from anywhere that uses Rancher, including clusters you add to it later. For a trial with no DNS, `rancher.203.0.113.10.sslip.io` resolves to that address.

For a highly available Rancher, give circuit-k3s three servers and point `hostname` at a load balancer. `server` is still one of them: it's only where Helm runs. The chart runs up to three Rancher pods, one per node.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-rancher/tree/v0.1.0/examples/local).

### Your own certificates

Rancher issues its own certificate through cert-manager by default. `chart_values` passes anything else the chart takes, such as Let's Encrypt, which also needs port 80 open and public DNS:

```hcl
chart_values = {
  ingress     = { tls = { source = "letsEncrypt" } }
  letsEncrypt = { email = "me@example.org", ingress = { class = "traefik" } }
}
```

Only the default has been run through this circuit. The other choices are in [Rancher's install docs](https://ranchermanager.docs.rancher.com/getting-started/installation-and-upgrade/install-upgrade-on-a-kubernetes-cluster).

## What it does

On the server you name, in order:

1. Checks that the k3s installed there is on `k3s_minors`, and stops with a message if it isn't. The check runs on every plan, so a later k3s upgrade past Rancher's range shows up too.
2. Waits for k3s's `helmcharts` CRD to be established, restarting k3s once if it's stuck. k3s installs Traefik through that CRD, and Rancher is reached through Traefik.
3. Downloads Helm and both charts to `/var/lib/conn3x-rancher`, checking each SHA-256. Helm stays there rather than in your `PATH`, so it won't get in the way of a Helm you already have.
4. Writes the bootstrap password to `/etc/rancher/manager/bootstrap-password` and your chart values to `/etc/rancher/manager/values.yaml`, both mode `0600`.
5. Creates the `cattle-system` namespace and the `bootstrap-secret` secret from that file.
6. Installs cert-manager with its CRDs, and then Rancher, waiting for each to roll out.
7. Waits for Rancher to report its own cluster, `local`, as active.

### The bootstrap password

Rancher's docs pass this with `--set bootstrapPassword=...`, which would put it in the host's process list and in Helm's stored values. This circuit creates the secret first instead, and leaves the value out of the chart. The chart's template picks up a secret that's already there, and Rancher reads it. Rancher's docs don't describe this route, so it's worth rechecking when you change `rancher_version`.

The variable is ephemeral, so the password never reaches state or a plan. It does live in two places on purpose: the root-only file on the server, and Kubernetes secrets in `cattle-system`, including Helm's record of the release, since the chart renders the secret as a hook. Anyone with admin on the cluster can read it there, which is one more reason to replace it at first login.

Rancher only uses the password the first time it sets up `admin`. Changing `bootstrap_password` later updates the file and the secret, not your login.

### What it doesn't do

- It doesn't install k3s. Use circuit-k3s, or any k3s whose binary is at `k3s` in the `PATH` with its kubeconfig at `/etc/rancher/k3s/k3s.yaml`.
- It doesn't open firewall ports. Rancher needs TCP 80 and 443 reaching the nodes. Rancher's docs ask for firewalld to be off, or for a zone that accepts the pod network and traffic between nodes.
- It doesn't make the cluster highly available, or back Rancher up.
- Deleting the module leaves Rancher running. Rancher's own docs cover removing it.

### Upgrading

Set `rancher_version`, `rancher_chart_sha256` and `k3s_minors` together, reading the supported versions from that release's notes. Take the checksum from `sha256sum rancher-VERSION.tgz` after downloading it from `https://releases.rancher.com/server-charts/stable/`. Conn3x runs `helm upgrade`, and a change to `chart_values` does too. Read the release's notes first.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `server` | any | Required | One k3s server to run Helm on: an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. |
| `hostname` | string | Required | DNS name Rancher answers on. |
| `bootstrap_password` | string, ephemeral | Required | Password for the first login as `admin`, at least 12 characters. |
| `rancher_version` | string | `"2.15.3"` | Rancher chart version from the stable repository, without a `v`. |
| `rancher_chart_sha256` | string | The 2.15.3 checksum | SHA-256 of `rancher-VERSION.tgz`. |
| `k3s_minors` | list(string) | `["1.34", "1.35", "1.36"]` | Kubernetes minor versions the server's k3s may run, from the Rancher release's notes. |
| `cert_manager_version` | string | `"v1.21.3"` | cert-manager chart version. |
| `cert_manager_chart_sha256` | string | The v1.21.3 checksum | SHA-256 of `cert-manager-VERSION.tgz`. |
| `helm_version` | string | `"v3.22.1"` | Helm release to install. |
| `helm_checksums` | map(string) | The v3.22.1 checksums | SHA-256 of the Helm tarball, for `amd64` and `arm64`. |
| `replicas` | number | `-3` | Rancher pods. A negative number means up to that many, one per node. |
| `chart_values` | any | `{}` | More Helm values for the Rancher chart. These reach state, so `bootstrapPassword` is refused here. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |

## Outputs

| Name | Description |
| --- | --- |
| `url` | Address of Rancher's UI and API, such as `"https://rancher.example.org"`. |
| `rancher_version` | Rancher chart version installed. |

## Requirements

Requires Conn3x v0.6.9 or later, a k3s server on a Kubernetes version Rancher supports, and outbound HTTPS to `get.helm.sh`, `charts.jetstack.io`, `releases.rancher.com` and the container registries. Rancher asks for at least 4 vCPUs and 16 GB of memory per node, on SSDs, and three nodes for production.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-rancher/tree/v0.1.0/examples/local) to each in a container on amd64, checks that the second plan has no changes, and runs [check.sh](https://github.com/conn3xorg/circuit-rancher/blob/v0.1.0/examples/local/check.sh): the API answers `/ping`, the bootstrap password logs in, a wrong one gets a 401, and the local cluster is `active`. A container shows that the install works. It doesn't show that Rancher survives a reboot or is reachable from outside. The same four containers also passed by hand on arm64.

The rest was run by hand on 4 vCPU, 16 GB droplets, Rancher's minimum, with one node each: Ubuntu 24.04, and Rocky Linux 10 with SELinux enforcing. On both, the same checks passed, `/ping` answered from outside through the `sslip.io` name, the password wasn't in state, and after a reboot the plan had no changes and the checks passed again. A k3s version outside `k3s_minors` stopped the apply with its message on Rocky Linux 10.

Not run: more than one node, arm64 on a real host, Let's Encrypt or your own certificates, an upgrade between Rancher releases, or adding a downstream cluster.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-rancher/blob/v0.1.0/LICENSE). Rancher and cert-manager are Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-rancher](https://github.com/conn3xorg/circuit-rancher). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-rancher/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-rancher/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-rancher/tree/v0.1.0/examples/local).
- Related circuits: [k3s](/circuits/k3s), [Docker](/circuits/docker), [Podman](/circuits/podman), [kubeadm](/circuits/kubeadm), [MicroShift](/circuits/microshift).
