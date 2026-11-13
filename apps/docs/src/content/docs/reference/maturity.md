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

Windows Server is in preview. Of the 25 `windows_*` modules, 15 have left experimental and 10 haven't yet: Active Directory, local users and groups, and `windows_update`. Those labels describe different things.

The preview is about Windows as a whole: Conn3x connects to Windows Server 2022 and 2025 over OpenSSH, puts their steps in the same plan as everything else, and `conn3x drift` checks them. That part works, and it's what the tested [Azure example](https://github.com/conn3xorg/conn3x/tree/main/examples/azure-windows-server) shows.

Experimental is about each module inside it. An experimental module is new, and its arguments may change between releases, so a configuration that uses one may need a few lines changed when you upgrade. A module leaves experimental once it meets every point on the [readiness page](https://github.com/conn3xorg/conn3x/blob/main/docs/windows-readiness.md): CI on Windows Server 2022 and 2025, use in a real circuit, import where it applies, no open bug and a complete page. Its module page says which it is.

## Where each word applies today

| What | Label | Why |
| --- | --- | --- |
| Linux hosts: Rocky Linux, RHEL, AlmaLinux, Fedora, Debian and Ubuntu | Stable | Every change is tested on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. |
| The Linux modules, the CLI, `conn3x drift` and `conn3x convert ansible` | Stable | Tested on every change. The converter marks what it can't prove instead of guessing. |
| Official circuits for Linux | Stable | Each is tested on the distributions its page lists. |
| `lifecycle` on steps | Preview | New in v0.8.0. It uses OpenTofu's own lifecycle rules, so they behave as you'd expect, but how they fit steps may still change before 1.0. |
| [`when`](/reference/circuits/steps#when) on steps, to run a step on only some hosts | Preview | New in v0.10.0. It filters the step's `for_each`, so it uses OpenTofu's own rules, but how it reads may still change before 1.0. |
| [`run_once`](/reference/circuits/steps#run_once) on steps, to run a step on one host | Preview | New in v0.10.0. Like `when`, it filters the step's `for_each`, and it's a sync point for every host even under `per_host`. |
| `import` on steps, to [adopt servers you already run](/guides/adopt-servers) | Preview | New in v0.8.0. Since v0.9.0 it works on 21 Linux modules, since v0.10.0 on Windows modules, and since v0.15.0 on 17 of them, all [listed here](/reference/circuits/steps#import), and through `provider::conn3x::import_id` on steps inside a module. Try it on a server you can rebuild before your oldest one. |
| Windows Server 2022 and 2025 | Preview | Standalone servers work, and so does a small domain: a new forest, servers joined to it, more domain controllers, and the OUs, groups and users inside it. A whole lab from one config, then Windows at scale, are the work now. |
| 15 `windows_*` modules: file, directory, registry value, service, feature, package, PowerShell, reboot, wait_for, firewall rule, scheduled task, IIS app pool, IIS site, ACL and DNS client | Preview, like Windows Server | Since v0.15.0 they meet every point on the [readiness page](https://github.com/conn3xorg/conn3x/blob/main/docs/windows-readiness.md). |
| The other 10 `windows_*` modules: Active Directory, local users and groups, and `windows_update` | Experimental | New, and their arguments may change between releases. Each one's runner test passes on Windows Server 2022 and 2025 in CI. [What each still needs](https://github.com/conn3xorg/conn3x/blob/main/docs/windows-readiness.md). |
| Running Conn3x itself on Windows (`conn3x.exe`) | Experimental | New in v0.10.0. It ran a plan and apply from Windows Server 2025 against Ubuntu and against itself. |
| Network-device circuits: [RouterOS baseline](/circuits/routeros-baseline), [OPNsense VLANs](/circuits/opnsense-vlans), [Proxmox VE network](/circuits/proxmox-network) | Experimental | Each was tested on a virtual image of its device, not hardware, through a community OpenTofu provider. |
| [Arista EOS modules](/network-devices) (`eos_config`, `eos_hostname`, `eos_vlan` since v0.9.0; `eos_interface` and `eos_user` since v0.10.0) | Experimental | Tested against cEOS-lab 4.37.0F on a local machine, not in CI and not on hardware. |
| [Juniper Junos modules](/network-devices#juniper-junos) (`junos_config`, `junos_hostname`, `junos_vlan`, `junos_interface`, `junos_user` since v0.17.0) | Experimental | Tested against vJunos-switch 26.2R1.7 on a lab VM, not in CI and not on hardware. |
| [`conn3x lint`](/reference/cli/lint), [`conn3x mcp`](/reference/cli/mcp) and [run reports](/reference/cli/apply#-report) | Experimental | New in v0.10.0. Their output and flags may change between releases. |
| The host agent | Experimental | Off by default. Conn3x runs every command over plain SSH unless you turn it on. |
| The [Circuit Builder](https://conn3x.org/build), for hosts you already have | Stable | CI validates every circuit it offers, alone and in a set of realistic builds. |
| The Builder creating the servers on AWS, Azure, Google Cloud or DigitalOcean | Preview | We've applied its configs on real servers on all four, by hand rather than on every change. On Azure it creates Linux hosts only. |
| [VyOS modules](/network-devices#vyos) (`vyos_config`, `vyos_hostname`, `vyos_interface` since v0.18.0) | Experimental | Tested against VyOS 2026.11.13-0016-rolling in a container on a lab VM, not in CI and not on hardware. |
| Windows hosts in the Builder, classic Cisco IOS over its own CLI, macOS hosts | Planned | See the [roadmap](/roadmap). |

## Now, Next and After that

The roadmap groups planned work under Now, Next, After that, Later and Last. Those headings give the order we'll build things in. Everything under them is planned, Now included, until a release ships it, and then it gets one of the other three words.
