---
title: Roadmap
description: What Conn3x does today, what we're building now and what comes after. Windows Server in preview today and Active Directory now, then more circuits, then network devices. No dates.
---

Conn3x closes the gap between creating infrastructure and configuring it: one plan, one state and one apply for the cloud and the servers in it. Today it does that for Linux, and for Windows Server in preview.

This page says what's planned and in what order. None of it has a date, and nothing here works until a release says it does. The [release notes](https://github.com/conn3xorg/conn3x/releases) are the record of what has shipped.

## Today

- **Linux hosts.** Conn3x configures Rocky Linux, RHEL, AlmaLinux, Fedora, Debian and Ubuntu. Every change to Conn3x is tested on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13.
- **Windows hosts, in preview.** Windows Server 2022 and 2025, over OpenSSH, from the same plan as everything else. Sixteen `windows_*` modules cover PowerShell scripts, reboots and waits, files, folders and access rules, registry values, services and features, users and groups, firewall rules, MSI packages, scheduled tasks, and IIS sites and app pools. `conn3x drift` checks these hosts the way it checks Linux ones. The [azure-windows-server](https://github.com/conn3xorg/conn3x/tree/main/examples/azure-windows-server) example builds a Windows Server VM on Azure and configures it in one plan. Every one of these modules is experimental, and its [page](/modules/windows_file) says so: details may change before 1.0.
- **109 official circuits.** Web servers, databases, monitoring, Kubernetes, DNS, VPNs, hardening, identity, detection and response, vulnerability scanning, compliance tracking, CI runners and a private AI stack, each pinned to a release and tested on the systems its page lists. [IIS](/circuits/iis) is the first for Windows Server, and it's experimental, like the modules it uses. The [circuit catalogue](/circuits) has them all.
- **The [Circuit Builder](https://conn3x.org/build).** Pick a distribution and the circuits you want, fill in a short form, and get a config that's ready to plan. k3s, Zabbix, FreeIPA and Velociraptor take their hosts by role, servers on some and agents or clients on others. It can also create the servers on DigitalOcean, Google Cloud, AWS or Azure, in the same plan. Azure here means Linux hosts, with Windows still to come. It won't let you pick two circuits that fight over a port, and CI validates every circuit it offers, alone and in a set of realistic builds. Your picks live in the page address, so you can share a build as a link.
- **AI you can account for.** A private AI stack from circuits: [Open WebUI](/circuits/openwebui) and [Ollama](/circuits/ollama) for chat that stays on your servers, a [LiteLLM](/circuits/litellm) gateway with per-team keys and budgets, [Presidio](/circuits/presidio) masking personal data before a model sees it, and [Langfuse](/circuits/langfuse) keeping a trace of every call.
- **Your playbooks come with you.** `conn3x convert ansible` rewrites the tasks it can prove and marks the rest with the reason.
- **Any OpenTofu provider.** Conn3x runs the same providers OpenTofu does, so it creates resources on AWS, Google Cloud, Azure, DigitalOcean and the rest. Examples tested end to end exist for DigitalOcean and Google Cloud, including [BigQuery](/tutorials/bigquery).
- **Runs on** Linux and macOS, on amd64 and arm64.

## Now: Windows

The preview configures standalone Windows servers. What it doesn't have yet is Active Directory: no module builds a domain controller or joins a server to a domain. That's the work now.

The test we're aiming at is a whole Active Directory lab, domain controllers and member servers, built and configured from one config, with a tested Azure example like the one for a single server.

## Next: another round of circuits

New circuits pause while Windows gets built. Requests still count: the last batch came from lists people sent us, so keep them coming and they'll go into this round.

## After that: network devices

Switches, routers and firewalls, configured over their own management interfaces, in the same plan as the hosts behind them.

## Later

macOS hosts.

## Last

The Circuit Builder as an app: desktop apps for Windows and macOS, and phone apps for iOS and Android.

## Help shape it

Open work is in [GitHub issues](https://github.com/conn3xorg/conn3x/issues), and every circuit repository has [good first issues](https://github.com/search?q=org%3Aconn3xorg+label%3A%22good+first+issue%22+state%3Aopen&type=issues) if you'd like somewhere to start. The order on this page moves when people tell us what they need. If Windows, network devices or a circuit you're missing matter to you, say so in [Discussions](https://github.com/conn3xorg/conn3x/discussions). See [Get involved](/contribute) for other ways to help.
