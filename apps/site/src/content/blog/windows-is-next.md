---
title: "Windows is next"
description: "Conn3x puts the cloud and the Linux servers in it into one plan. The next stretch of work does the same for Windows, with Azure examples we'll test end to end. Here's the order, and why."
date: 2026-12-20
author: James Conway
---

Ask anyone who runs a mixed estate how a Windows server gets built and you'll hear two tools and a handoff. Terraform makes the VM. Then something else (a PowerShell script, a DSC configuration, an Ansible playbook over WinRM) makes it useful. Two runs, two sets of state or none, and a gap in the middle where the IP address gets copied from one to the other.

That gap is the one Conn3x was built to close. On Linux it's closed: one plan shows the droplet about to be created next to every package, file and service headed for it, and `conn3x drift` tells you when either side has moved. Windows is what we're working on next.

## What that means

The same thing it means on Linux. A Windows server in the same plan as the cloud it runs in, with every change shown before it's made, one state file, and drift checked on both layers. None of it works yet. When it does, a release will say so, and the [roadmap](https://docs.conn3x.org/roadmap) will move it from *next* to *today*.

## And Azure

You can already create Azure resources with Conn3x, because it runs the same `hashicorp/azurerm` provider OpenTofu does. What nobody has done is test it. We test cloud examples for real, on real accounts, before they're published. [circuit-caddy](https://docs.conn3x.org/circuits/caddy) has one for Google Cloud that builds a VM and serves a page with a real certificate in one apply. Azure examples get the same treatment, and since a lot of Windows servers live on Azure, they arrive with the Windows work.

## Why Windows before network devices

Network devices used to be first on the list. We swapped them because Windows servers have the same gap Linux servers had: a VM from one tool, its configuration from another. Closing it there is the same job Conn3x already does, on a new kind of host. Network devices are a different shape of problem, and they come straight after.

## Tell us what you'd configure first

The order can still move. If you run Windows servers, the most useful thing you can tell us is what you'd want Conn3x to do on day one. Features, services, IIS sites, registry keys, scheduled tasks? Say so in [Discussions](https://github.com/conn3xorg/conn3x/discussions), and it shapes what ships first.
