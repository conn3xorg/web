---
title: "MicroShift on one Rocky Linux box"
description: "A new official circuit turns a single Rocky Linux 10 host into a MicroShift cluster. What it does, what we found getting it there, and the parts of the supply chain we wouldn't copy from the install docs."
date: 2026-10-29
---

Can Conn3x do OpenShift? Full OpenShift brings an installer of its own, and even its single-node form asks for 8 CPUs and 16 GB of memory, which is more than a circuit should take on. MicroShift is the other end of that range: the OpenShift API, router and `oc` on a single small machine, built for the edge and a nice fit for a homelab.

So there's now a [MicroShift circuit](https://github.com/conn3xorg/circuit-microshift):

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

On a fresh 4-CPU droplet, `conn3x apply` took about five minutes and ended with the node Ready. A second plan had no changes. After that, `oc` worked from a laptop with the kubeconfig MicroShift writes for the address in `subjectAltNames`, and a `Route` served traffic on port 80.

## Whose MicroShift this is

Red Hat's MicroShift is part of Red Hat Device Edge, and it comes with a subscription. This circuit installs the community build from [microshift-io](https://github.com/microshift-io/microshift), which packages upstream MicroShift on top of OKD. That's what lets it run on Rocky Linux without a Red Hat account. It also means nobody is on the hook for support, and the README says so up front.

It installs 4.20.0, the newest microshift-io release that isn't an early candidate. Rocky Linux 10 on x86_64 is the only platform it's been tried on, and the plan refuses anything that isn't an x86_64 EL10 host.

## The packages we didn't trust

MicroShift needs a few things Rocky doesn't ship: cri-o, runc and `oc` built for OpenShift, plus `containernetworking-plugins`. The upstream instructions get them by adding OpenShift's dependency mirror as a repository with `gpgcheck=0`. The MicroShift RPMs themselves come from a release tarball, also unsigned.

We weren't comfortable putting an unsigned container runtime on your host from a repository that can change under you. Instead, the circuit downloads each of those files by URL and checks it against a SHA-256 pinned in the circuit. A swapped or tampered file fails the apply. Everything else comes from your distribution's signed repositories.

There's a cost, and it's worth knowing before you rely on it. OpenShift's mirror keeps only the newest build of each package, so when it moves on, a pinned URL stops working and the apply fails at the download. We'll ship new pins when that happens. Until we do, the pins are an input, so you can pass your own.

## What the droplets taught us

The first clean-host run never got the pod network up. kube-proxy couldn't write its iptables rules because the cloud image only had `kernel-modules-core`, and the modules it needed live in `kernel-modules-extra`. An earlier hand-built prototype had hidden that by rebooting into a newer kernel that happened to have them. The circuit now installs `kernel-modules-extra` for whatever kernel is running.

A review pass after the first green run then found two quieter bugs: changing the pinned packages never reinstalled them, and changing the release never restarted MicroShift. Both are fixed, and the retest on a fresh host covered a config change too.

One thing to keep in mind if the box has a public address: the OpenShift router answers on ports 80 and 443 of every address it has, and with firewalld running a `Route` still answered from outside. Put the host on your own network, or a firewall in front of it.

## Try it

The [README](https://github.com/conn3xorg/circuit-microshift#readme) has the inputs, exactly what was tested, and what isn't covered yet: aarch64, storage, OVN-Kubernetes and upgrades between releases. If you run it somewhere we haven't, tell us how it went in [Discussions](https://github.com/conn3xorg/conn3x/discussions).
