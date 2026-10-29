---
title: Roadmap
description: What Conn3x does today, what comes next and in what order. Windows hosts are next, with tested Azure examples, then network devices. No dates.
---

Conn3x closes the gap between creating infrastructure and configuring it: one plan, one state and one apply for the cloud and the servers in it. Today it does that for Linux. Windows is next.

This page lists what's planned and in what order. None of it has a date, and nothing here works until a release says it does. The [release notes](https://github.com/conn3xorg/conn3x/releases) are the record of what has shipped.

## Today

- **Linux hosts.** Conn3x configures Rocky Linux, RHEL, AlmaLinux, Fedora, Debian and Ubuntu. Every change is tested on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13.
- **Any OpenTofu provider.** Conn3x runs the same providers OpenTofu does, so it can create resources on AWS, Google Cloud, Azure, DigitalOcean and the rest. Examples tested end to end exist for DigitalOcean and Google Cloud.
- **Runs on** Linux and macOS, on amd64 and arm64.

## Next: Windows

Windows servers, configured from the same plan as the cloud they run in. Like Linux hosts today, the plan shows every change before it's made, and `conn3x drift` checks Windows hosts as well as the cloud resources around them.

Azure comes with this work. You can already create Azure resources through the `hashicorp/azurerm` provider, but nobody has tested that with Conn3x yet. The Windows work adds tested examples that create Azure VMs and configure them in one apply, as [circuit-caddy](/circuits/caddy) does on Google Cloud.

## After that: network devices

Switches, routers and firewalls, configured over their own management interfaces, in the same plan as the hosts behind them.

## Later

macOS hosts.

## Help shape it

Open work is tracked in [GitHub issues](https://github.com/conn3xorg/conn3x/issues), and the order on this page can change when people tell us what they need. If Windows or network devices matter to you, say what you'd configure first in [Discussions](https://github.com/conn3xorg/conn3x/discussions). See [Get involved](/contribute) for other ways to help.
