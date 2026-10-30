---
title: Roadmap
description: What Conn3x does today, what we're building now and what comes after. Windows hosts with tested Azure examples now, then more circuits, then network devices. No dates.
---

Conn3x closes the gap between creating infrastructure and configuring it: one plan, one state and one apply for the cloud and the servers in it. Today it does that for Linux. Windows is next.

This page says what's planned and in what order. None of it has a date, and nothing here works until a release says it does. The [release notes](https://github.com/conn3xorg/conn3x/releases) are the record of what has shipped.

## Today

- **Linux hosts.** Conn3x configures Rocky Linux, RHEL, AlmaLinux, Fedora, Debian and Ubuntu. Every change to Conn3x is tested on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13.
- **82 official circuits.** Web servers, databases, monitoring, Kubernetes, DNS, VPNs, hardening, identity, detection and response, vulnerability scanning, compliance tracking, CI runners and a private AI stack, each pinned to a release and tested on the distributions its page lists. The [circuit catalogue](/circuits) has them all.
- **The [Circuit Builder](https://conn3x.org/build).** Pick a distribution and the circuits you want, fill in a short form, and get a config that's ready to plan. k3s, Zabbix, FreeIPA and Velociraptor take their hosts by role, servers on some and agents or clients on others. It can also create the servers on DigitalOcean, in the same plan. It won't let you pick two circuits that fight over a port, and CI validates every circuit it offers, alone and in a set of realistic builds. Your picks live in the page address, so you can share a build as a link.
- **AI you can account for.** A private AI stack from circuits: [Open WebUI](/circuits/openwebui) and [Ollama](/circuits/ollama) for chat that stays on your servers, a [LiteLLM](/circuits/litellm) gateway with per-team keys and budgets, [Presidio](/circuits/presidio) masking personal data before a model sees it, and [Langfuse](/circuits/langfuse) keeping a trace of every call.
- **Your playbooks come with you.** `conn3x convert ansible` rewrites the tasks it can prove and marks the rest with the reason.
- **Any OpenTofu provider.** Conn3x runs the same providers OpenTofu does, so it creates resources on AWS, Google Cloud, Azure, DigitalOcean and the rest. Examples tested end to end exist for DigitalOcean and Google Cloud.
- **Runs on** Linux and macOS, on amd64 and arm64.

## Now: Windows

Windows servers, configured from the same plan as the cloud they run in. As with Linux hosts today, the plan shows every change before it's made, and `conn3x drift` checks Windows hosts as well as the cloud resources around them. None of this works yet.

Azure comes with this work. You can already create Azure resources through the `hashicorp/azurerm` provider, but nobody has tested that with Conn3x yet. The Windows work adds tested examples that create Azure VMs and configure them in one apply, as [circuit-caddy](/circuits/caddy) does on Google Cloud.

The test we're aiming at is a whole Active Directory lab, domain controllers and member servers, built and configured from one config.

## Next: another round of circuits

New circuits pause while Windows gets built. Requests still count: the last batch came from lists people sent us, so keep them coming and they'll go into this round.

## After that: network devices

Switches, routers and firewalls, configured over their own management interfaces, in the same plan as the hosts behind them.

## Later

macOS hosts.

## Help shape it

Open work is in [GitHub issues](https://github.com/conn3xorg/conn3x/issues), and every circuit repository has [good first issues](https://github.com/search?q=org%3Aconn3xorg+label%3A%22good+first+issue%22+state%3Aopen&type=issues) if you'd like somewhere to start. The order on this page moves when people tell us what they need. If Windows, network devices or a circuit you're missing matter to you, say so in [Discussions](https://github.com/conn3xorg/conn3x/discussions). See [Get involved](/contribute) for other ways to help.
