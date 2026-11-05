---
title: "Why we test on Rocky Linux, not CentOS"
description: "CentOS Linux reached end of life on 30 June 2024. Every official Conn3x circuit now stops a CentOS host at plan time and says why, before anything changes on it. Here's what changed, and what CentOS Stream has to do with it."
date: 2026-12-01
author: James Conway
---

Somewhere there's a CentOS 7 box still running. It took the payroll export in 2016, nobody has wanted to touch it since, and it's the reason your team's runbook still says `yum`.

It stopped getting updates on 30 June 2024. CentOS 8 went before it, on 31 December 2021, years earlier than anyone planned for. So when you point Conn3x at that box, the kindest thing we can do is tell you so at plan time, in one sentence, before anything changes on it.

As of 5 November, that's what every official circuit does.

## What a CentOS host gets now

Take [circuit-docker](https://github.com/conn3xorg/circuit-docker). It reads each host's distribution to pick Docker's package repository, and until v0.2.1 an unexpected one fell through to an index error. Accurate, in its way. Not much help at 6 p.m. on a Friday.

Now the plan stops with this:

```text
Host web1 runs centos. This circuit supports Rocky Linux, AlmaLinux, RHEL, Fedora, Debian and Ubuntu. CentOS Linux reached end of life on 30 June 2024: use Rocky Linux.
```

That check runs against what the host reports about itself, so it doesn't matter what you wrote in the circuit. The other route in was the `os` field on a host object, where you tell a circuit the distribution up front. Circuits that take one no longer accept `centos`, and the error reads the same way:

```text
A host object's os must be one of debian, ubuntu, rocky, almalinux, rhel or fedora. CentOS Linux reached end of life on 30 June 2024: use Rocky Linux.
```

Forty-six circuits changed that day. Dropping a value someone might have been passing is a breaking change, so 44 of them got a minor version bump rather than a patch; the other two only changed their READMEs. If you pin with `?ref=`, as you should, nothing moves until you move it.

## CentOS Stream is a different thing

Here's where it's easy to get sloppy, so let's not. CentOS Stream 9 and 10 are alive and getting updates. What ended is CentOS Linux, the rebuild of RHEL that so many of us used because it was RHEL without the subscription.

Stream sits on the other side of RHEL. It's where changes land before they reach the next RHEL minor release, which makes it a preview of RHEL, not a copy of one. That's genuinely useful if you build software for RHEL and want to see what's coming. It's the wrong shape for a server you want to leave alone for five years.

A Stream host reports itself as `centos` too, so it gets the same message. That's deliberate. We don't test circuits on Stream, and we'd rather say no clearly than let you find the difference on your servers.

## Why Rocky

When Red Hat announced in December 2020 that CentOS Linux 8 would end in 2021 instead of 2029, people needed somewhere to go. Rocky Linux, started by Gregory Kurtzer, one of CentOS's original founders, became the community rebuild most CentOS users moved to. It aims to be what CentOS Linux was: RHEL, rebuilt from source, bug for bug.

That's why Rocky Linux 10 sits in every pull request test for Conn3x itself, next to Fedora 45, Ubuntu 24.04 and Debian 13, and why the nightly run builds a real Rocky Linux 10 droplet. Nearly every circuit tests it the same way. So the CentOS change didn't add Rocky anywhere: it was already the RHEL-family host the circuits targeted and tested. All we did was stop accepting a name we'd never tested against.

AlmaLinux and RHEL stay in the accepted list, because circuits treat them as the same family as Rocky. Moving off CentOS to either of those is fine by us.

## Moving that CentOS 7 box

There's no in-place upgrade from CentOS 7 to Rocky 10. Build a new host, point the circuit at it, and let Conn3x put the same packages, files and services on it that you'd have wanted on the old one. That's the part a circuit is good at: the second machine comes out the same as the first, and the next plan tells you whether it still is.

Then turn the old box off. It's had a long run.

If you're stuck on something only CentOS has, a package or a vendor that won't certify anything else, [tell us in Discussions](https://github.com/conn3xorg/conn3x/discussions). We'd like to know what's holding people there.
