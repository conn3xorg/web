---
title: MicroShift
description: "Turns one Rocky Linux 10 box into a single-node MicroShift cluster, with every unsigned package pinned by checksum."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-microshift at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/microshift/grade.svg)](https://conn3x.org/circuits/microshift/grade)

A Conn3x circuit that turns a Rocky Linux 10 box into a single-node MicroShift cluster: the small, edge-sized cut of OpenShift, with the OpenShift router, `Route` objects and the `oc` client, on one small machine.

It installs the community build from [microshift-io](https://github.com/microshift-io/microshift), which packages upstream MicroShift on top of OKD. That's not Red Hat's product and it carries no Red Hat support. If you need supported OpenShift, Red Hat sells it as Red Hat Device Edge; this circuit is for homelabs, test rigs and learning OpenShift without a full cluster.

## Usage

```hcl
module "microshift" {
  source = "github.com/conn3xorg/circuit-microshift?ref=v0.1.0"

  hosts                = { node = "203.0.113.10" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  config = {
    apiServer = { subjectAltNames = ["203.0.113.10"] }
  }
}
```

Run `conn3x init` and `conn3x apply`. On a 4-CPU cloud host the first apply took about five minutes, and it finishes once the node is Ready. A second `conn3x plan` says `No changes.`

Then fetch a kubeconfig that points at the address you put in `subjectAltNames`:

```sh
scp root@203.0.113.10:/var/lib/microshift/resources/kubeadmin/203.0.113.10/kubeconfig .
oc --kubeconfig kubeconfig get pods -A
```

The API listens on port 6443, and the OpenShift router serves `Route`s on 80 and 443 of every address the host has. Anyone who can reach 6443 and holds that kubeconfig is cluster admin, so keep the host on your own network or put a firewall in front of it. firewalld on the host doesn't fence the router: with it running, a `Route` still answered on port 80 from outside, because the router's port mapping is handled before firewalld's zones see the traffic.

## What it does

On each host, in order:

1. Installs `kernel-modules-extra` for the running kernel. Cloud images often ship only `kernel-modules-core`, and kube-proxy needs `xt_conntrack` and `xt_comment` from the extra set. Without them the pod network never comes up.
2. Loads `nf_conntrack` now and at boot, through `/etc/modules-load.d/microshift.conf`.
3. Raises `fs.inotify.max_user_watches` and `fs.inotify.max_user_instances`, as MicroShift asks.
4. Downloads the release's `microshift-rpms-x86_64.tgz` and the five RPMs in `dependency_rpms` to `/var/lib/conn3x-microshift`, checking each against its SHA-256, then unpacks the release.
5. Installs `microshift` and `microshift-kindnet` from the unpacked release, with the dependency RPMs alongside. It runs again whenever `release` or `dependency_rpms` changes.
6. If firewalld is running, trusts `10.42.0.0/16` (the pods) and `169.254.169.1` (cluster DNS), and opens 6443/tcp. If it isn't running, leaves the firewall alone.
7. Writes `config` to `/etc/microshift/config.yaml`.
8. Starts and enables `microshift`, and restarts it when `config`, `release` or `dependency_rpms` changes.
9. Waits up to 15 minutes for the node to turn Ready.

The pod network is kindnet, not OVN-Kubernetes. No storage driver is installed, so a `PersistentVolumeClaim` stays pending until you add one.

### Where the packages come from

None of what this circuit installs from outside your distribution is signed. The microshift-io release is unsigned. MicroShift also needs cri-o, cri-tools, runc and `oc` built for OpenShift, which upstream installs from OpenShift's dependency mirror with signature checks turned off, and `containernetworking-plugins`, which Rocky Linux 10 doesn't ship.

So the circuit doesn't add those repositories. It downloads each file by URL and checks it against a SHA-256 pinned in `release` and `dependency_rpms`, which is what makes a tampered or swapped file fail the apply instead of landing on your host. The MicroShift packages themselves, including the ones it pulls in from the same release such as `microshift-selinux`, come from the unpacked tarball, so its checksum covers them too. Everything else, such as `crun` and `podman`, comes from your host's signed repositories.

The catch: OpenShift's mirror keeps only the newest build of each package. When it moves on, the pinned URL stops working and the apply fails at the download. A new release of this circuit updates the pins. Until then, you can pass your own `dependency_rpms`.

### What it doesn't do

- More than one node. MicroShift is single-node by design.
- Ubuntu, Debian, Fedora, aarch64, or Rocky Linux 9. The plan fails on any host that isn't x86_64 Rocky Linux 10, AlmaLinux 10, CentOS Stream 10 or RHEL 10, and only Rocky Linux 10 has been tried.
- Storage (TopoLVM), Operator Lifecycle Manager or OVN-Kubernetes. microshift-io ships them as extra packages; this circuit doesn't install them.
- Tested upgrades. Changing `release` installs from the new tarball and restarts MicroShift, but no upgrade between two releases has been tried.
- Removal. Deleting the module leaves MicroShift running. `microshift-cleanup-data --all` and `dnf remove 'microshift*'` take it off.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `config` | any | `{}` | Settings for `/etc/microshift/config.yaml`, such as `{ apiServer = { subjectAltNames = ["203.0.113.10"] } }`. MicroShift restarts when they change. |
| `release` | object | 4.20.0 | The microshift-io release: `tag`, and the `sha256` of its `microshift-rpms-x86_64.tgz`. The default is `4.20.0_g153ff0ca9_4.20.0_okd_scos.16`, the newest release that isn't an early candidate. |
| `dependency_rpms` | map(object) | cri-o 1.33, cri-tools, runc, `oc` 4.20, containernetworking-plugins | RPMs MicroShift needs that Rocky Linux 10 doesn't ship, by name, each with a `url` and `sha256`. The defaults match the default `release`. |

## Outputs

| Name | Description |
| --- | --- |
| `kubeconfig_path` | Path on each host of the admin kubeconfig, which talks to the API on localhost. |
| `remote_kubeconfig_dir` | Directory on each host holding one admin kubeconfig per hostname and per name in `config.apiServer.subjectAltNames`, for use from other machines. |

## Requirements

Requires Conn3x v0.6.5 or later. MicroShift asks for at least 2 CPUs, 2 GB of memory and 10 GB of free disk; it was tested with 4 CPUs and 8 GB. Each host also needs systemd and outbound HTTPS to GitHub, `mirror.openshift.com`, `kojihub.stream.centos.org`, `quay.io` and your distribution's mirrors.

## Tested on

Rocky Linux 10 only, by hand, on a DigitalOcean droplet with 4 CPUs and 8 GB of memory and SELinux enforcing. CI only validates the configuration: MicroShift needs a real kernel, and the containers the other circuits test in can't give it one.

From a fresh droplet, the first apply took about five minutes and the second plan had no changes. A `whoami` deployment exposed through a `Route` answered on port 80, `oc` worked from another machine with the kubeconfig for the `subjectAltNames` address, and a pod resolved a service name through cluster DNS. The same checks passed after starting firewalld and applying again, and again after a reboot, where the second plan stayed clean. The audit log had no denials at any point.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-microshift/blob/v0.1.0/LICENSE). MicroShift is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-microshift](https://github.com/conn3xorg/circuit-microshift). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-microshift/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-microshift/tags) list every release.
- Examples: [examples/single-node](https://github.com/conn3xorg/circuit-microshift/tree/v0.1.0/examples/single-node).
- Related circuits: [Docker](/circuits/docker), [Podman](/circuits/podman), [k3s](/circuits/k3s), [kubeadm](/circuits/kubeadm), [Rancher](/circuits/rancher), [containerd](/circuits/containerd), [Nomad](/circuits/nomad), [Helm](/circuits/helm), [Istio](/circuits/istio), [Flux](/circuits/flux).
