---
title: "Conn3x v0.6.5: circuits that share a host get along"
description: "Package steps from two circuits now wait for each other's locks, ufw rules applied together all stick, and sysctl and file steps work on minimal images. Six fixes, three of them from contributors."
date: 2026-10-28
---

Picture a fresh server with two circuits on it, each installing packages. The apply starts, both reach for `apt-get` in the same second, and one of them dies on `Could not get lock /var/lib/apt/lists/lock`. Run it again and it works, which is worse, because now you don't trust it.

v0.6.5 is out, and it fixes that. Six fixes in all, and the theme is the same in most of them: when a step says it worked, it did.

## Circuits that share a host

Two circuits installing packages on one host could run `apt-get` or `dnf` at the same moment, and the second failed with apt's lock error or rpm's `can't create transaction lock`. A host that had just booted hit the same thing while unattended-upgrades or dnf-makecache ran. Package and repository steps now wait up to five minutes for the lock. ([#157](https://github.com/conn3xorg/conn3x/pull/157))

The firewall had a quieter version of the problem. ufw has no lock of its own, so rules applied at the same moment on one host could be lost while the apply reported success. You'd find out when a port didn't answer. Conn3x now changes one ufw rule at a time on each host, reads each rule back, and fails the step if ufw didn't keep it. ([#158](https://github.com/conn3xorg/conn3x/pull/158))

## sysctl tells you what the kernel kept

On Ubuntu 24.04, `sysctl -p` exits 0 even when the kernel refuses a key, as in a container where `/proc/sys` is read-only. So the apply said yes, and only the next plan showed the step out of sync. Conn3x now reads the running value back after loading the file, and the step fails with the value the kernel kept. ([#156](https://github.com/conn3xorg/conn3x/pull/156), fixes [#151](https://github.com/conn3xorg/conn3x/issues/151))

Some minimal images, Rocky Linux's ubi-init among them, ship without `/etc/sysctl.d` at all, and the step failed with `mktemp: failed to create file via template '/etc/sysctl.d/.conn3x.XXXXXX'`. Conn3x now creates the directory, owned by root with mode `0755`, before it writes the setting. ([#150](https://github.com/conn3xorg/conn3x/pull/150), fixes [#140](https://github.com/conn3xorg/conn3x/issues/140))

## file makes the directory it needs

Same images, same `mktemp` error, different step. Writing `/etc/modules-load.d/kubernetes.conf` failed because the directory didn't exist, so circuits needed a `directory` step first. `file` and `template` now create missing parent directories with the host's default mode, and that extra step can go. ([#160](https://github.com/conn3xorg/conn3x/pull/160), fixes [#159](https://github.com/conn3xorg/conn3x/issues/159))

## Smaller fixes

- Parallel reads on one host no longer wait in line to check the connection. Every read checks its SSH connection with a keepalive, and a connection answers those one at a time; checks made at the same moment now share one. ([#153](https://github.com/conn3xorg/conn3x/pull/153))

## Five new circuits

Five new official circuits went public today too. [k3s](https://github.com/conn3xorg/circuit-k3s), [docker](https://github.com/conn3xorg/circuit-docker), [kubeadm](https://github.com/conn3xorg/circuit-kubeadm), [monitoring](https://github.com/conn3xorg/circuit-monitoring) and [firewall](https://github.com/conn3xorg/circuit-firewall) are in the [circuits directory](/circuits): a k3s cluster that runs on a Raspberry Pi, an HA kubeadm control plane, Docker with your Compose stacks, Prometheus and Grafana, and a default-deny firewall that opens SSH before it turns on. The firewall circuit needs v0.6.5, because it applies several ufw rules at once.

## Upgrading

With Homebrew:

```sh
brew upgrade conn3x
```

Otherwise, download v0.6.5 from the [release page](https://github.com/conn3xorg/conn3x/releases/tag/v0.6.5) or pull `ghcr.io/conn3xorg/conn3x:v0.6.5`. [Install](https://docs.conn3x.org/install) has the commands and how to check the signature.

Two things behave differently. A `sysctl` step that used to report success while the kernel kept the old value now fails, so an apply that passed before can stop there; that's the step telling you the truth. And package and repository steps wait for a lock now instead of failing, so an apply on a busy host can take longer.

## Thanks

- @coderbhawesh, for the missing `/etc/sysctl.d` fix and its end-to-end test on all four distributions ([#150](https://github.com/conn3xorg/conn3x/pull/150)), and for catching the silent `sysctl -p` success ([#156](https://github.com/conn3xorg/conn3x/pull/156)).
- @bfs2021, for making `file` create missing parent directories ([#160](https://github.com/conn3xorg/conn3x/pull/160)). Their first Conn3x pull request.

## What's next

No dates, but the open work is public. `file`, `directory` and `link` with `state = "absent"` ([#143](https://github.com/conn3xorg/conn3x/issues/143)), and checking new file content with a validate command before it replaces the file ([#144](https://github.com/conn3xorg/conn3x/issues/144)), are both labelled help wanted. If you'd rather start small, [#84](https://github.com/conn3xorg/conn3x/issues/84) teaches the Ansible converter two more repository tasks, and it's a good first issue.

The full list of changes is in the [release notes](https://github.com/conn3xorg/conn3x/releases/tag/v0.6.5). Something not behaving the way this post says? Tell us in [Discussions](https://github.com/conn3xorg/conn3x/discussions).
