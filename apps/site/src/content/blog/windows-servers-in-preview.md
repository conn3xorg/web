---
title: "Windows servers, in the same plan"
description: "Conn3x v0.7.0 configures Windows Server 2022 and 2025 over OpenSSH, from the same plan as the Azure VM they run on. It's a preview. Here's what works, what doesn't yet, and what we were careful about."
date: 2026-11-04
author: James Conway
---

Ask anyone who runs a mixed estate how a Windows server gets built, and you'll hear about two tools and a handoff. Terraform makes the VM. Then something else (a PowerShell script, a DSC configuration, a playbook over WinRM) makes it useful. Two runs, two kinds of state or none at all, and an IP address copied by hand from one to the other.

On Linux, Conn3x closed that gap a while ago. As of v0.7.0, it closes it for Windows too.

## What it looks like

The Azure VM and what goes on it sit in one config. The circuit's host is the VM's public IP, its host key comes from the same plan, and every step below shows up in `conn3x plan` next to the VM it lands on:

```hcl
circuit "windows" {
  hosts = {
    win1 = {
      address  = azurerm_public_ip.this.ip_address
      host_key = tls_private_key.host.public_key_openssh
    }
  }

  ssh {
    user             = "azadmin"
    private_key_file = var.admin_private_key_file
    become           = true
  }

  step "web_server" {
    windows_feature {
      name = "Web-Server"
    }
  }

  step "restart_if_needed" {
    windows_reboot {
      only_if_pending = true
    }
  }

  step "web_running" {
    windows_service {
      name       = "W3SVC"
      start_mode = "auto"
      state      = "running"
    }
  }
}
```

That's trimmed from [`azure-windows-server`](https://github.com/conn3xorg/conn3x/tree/main/examples/azure-windows-server), which builds the VM and configures it in one apply. We ran it on real Azure VMs, on Server 2025 and on 2022, before it shipped.

## What's in the preview

Sixteen Windows steps, all over the OpenSSH that ships with Windows Server. Nothing to install on the server, no WinRM:

- **Files and settings:** files, folders, access rules, registry values, services and Windows features.
- **People and the firewall:** local users and groups, and firewall rules.
- **Software:** MSI packages, checked against a SHA-256 before `msiexec` sees them, and scheduled tasks.
- **IIS:** app pools and sites.
- **The basics:** PowerShell scripts with guards, reboots, and waiting for a path, a service or a port.

Reads change nothing, so `conn3x drift` checks a Windows host the same way it checks a Linux one. And `conn3x convert ansible` now maps the `ansible.windows`, `community.windows` and `microsoft.iis` modules that have a step, leaving the rest marked with the reason.

## What we were careful about

A tool that configures servers runs with every right they have, so most of the work went into what it refuses to do.

Passwords travel to the host through stdin, never the command line, and stay out of the plan and the state. A firewall rule that would cut off the SSH connection Conn3x is using is refused before it's applied. A file that should be private carries its access rules from the instant it exists, not a moment later. An IIS site won't serve a folder a non-admin can change, because whoever writes there can run code as the site. And a scheduled task with high rights won't run a program from a folder anyone but administrators could swap.

## What it doesn't do yet

It's a preview, and the module pages say *experimental* for a reason: names and defaults may still move before 1.0. Active Directory (forests, domain controllers, joining a domain) is what we're building now. Server Core, older releases and Windows client editions aren't tested. Conn3x itself still runs on Linux and macOS, so you drive Windows servers from one of those, or from CI.

## Try it

Upgrade to v0.7.0 (`brew upgrade conn3x`, or grab it from the [release page](https://github.com/conn3xorg/conn3x/releases)), and start from the Azure example, or point a circuit at a Windows Server you already have with OpenSSH on. The module pages are in the [docs](https://docs.conn3x.org).

If you run Windows servers, tell us what you'd want next, and what broke. [Discussions](https://github.com/conn3xorg/conn3x/discussions) is the place, and it really does change the order things get built in.
