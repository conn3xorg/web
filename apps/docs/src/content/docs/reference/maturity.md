---
title: Stable, preview, experimental and planned
description: The four words Conn3x uses for how far along something is, what each one promises, and where each applies today.
---

Conn3x labels everything it ships with one of four words. Each says what you can lean on, and how much to test before you do. Anything without a label is stable.

## The four words

**Stable.** Tested on every change, on the systems its page lists. Use it for real work. Conn3x is still before 1.0, so stable means tested, not frozen: if a release changes how you write something stable, its [release notes](https://github.com/conn3xorg/conn3x/releases) say what changed and what to do. Read them before you upgrade.

**Preview.** Usable today, for real servers. The shape of it is settled enough that we tell people to try it, but details may change before 1.0, and there are known gaps that its page names. Try it on hosts you can rebuild before you lean on it.

**Experimental.** It works where we tested it, and the testing is limited: a single setup, a virtual image instead of hardware, or a module new enough that its arguments may change in any release. Don't put it in front of anything critical in production yet. Telling us how it went is the fastest way to move it up.

**Planned.** On the [roadmap](/roadmap), and not in any release. Nothing planned works until a release says it does.

## Preview and experimental together

Windows Server is in preview, and every `windows_*` module is experimental. Those two labels describe different things.

The preview is about Windows as a whole: Conn3x connects to Windows Server 2022 and 2025 over OpenSSH, puts their steps in the same plan as everything else, and `conn3x drift` checks them. That part works, and it's what the tested [Azure example](https://github.com/conn3xorg/conn3x/tree/main/examples/azure-windows-server) shows.

Experimental is about each module inside it. They're new, and the arguments of any one of them may change between releases. So a Windows configuration you write today should keep working in principle, and you may still have to change a few lines of it when you upgrade. A circuit built on those modules, such as [IIS](/circuits/iis), is experimental for the same reason.

## Where each word applies today

| What | Label | Why |
| --- | --- | --- |
| Linux hosts: Rocky Linux, RHEL, AlmaLinux, Fedora, Debian and Ubuntu | Stable | Every change is tested on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. |
| The Linux modules, the CLI, `conn3x drift` and `conn3x convert ansible` | Stable | Tested on every change. The converter marks what it can't prove instead of guessing. |
| Official circuits for Linux | Stable | Each is tested on the distributions its page lists. |
| `lifecycle` on steps | Preview | New in v0.8.0. It uses OpenTofu's own lifecycle rules, so they behave as you'd expect, but how they fit steps may still change before 1.0. |
| `import` on steps, to [adopt servers you already run](/guides/adopt-servers) | Preview | New in v0.8.0, on `file`, `template`, `directory`, `link`, `package`, `service`, `user` and `group` on Linux. Try it on a server you can rebuild before your oldest one. |
| Windows Server 2022 and 2025 | Preview | Standalone servers work, and so does a small domain: a new forest, servers joined to it, more domain controllers, and the OUs, groups and users inside it. A whole lab from one config, then Windows at scale, are the work now. |
| The `windows_*` modules, and circuits built on them | Experimental | New, and their arguments may change between releases. |
| Network-device circuits: [RouterOS baseline](/circuits/routeros-baseline), [OPNsense VLANs](/circuits/opnsense-vlans), [Proxmox VE network](/circuits/proxmox-network) | Experimental | Each was tested on a virtual image of its device, not hardware, through a community OpenTofu provider. |
| The host agent | Experimental | Off by default. Conn3x runs every command over plain SSH unless you turn it on. |
| The [Circuit Builder](https://conn3x.org/build), for hosts you already have | Stable | CI validates every circuit it offers, alone and in a set of realistic builds. |
| The Builder creating the servers on AWS, Azure, Google Cloud or DigitalOcean | Preview | We've applied its configs on real servers on all four, by hand rather than on every change. On Azure it creates Linux hosts only. |
| Windows hosts in the Builder, network devices over their own CLI, macOS hosts | Planned | See the [roadmap](/roadmap). |

## Now, Next and After that

The roadmap groups planned work under Now, Next, After that, Later and Last. Those headings give the order we'll build things in. Everything under them is planned, Now included, until a release ships it, and then it gets one of the other three words.
