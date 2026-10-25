---
title: "Conn3x v0.1: one plan for the server and what runs on it"
description: "The first release of Conn3x creates cloud servers and configures them in the same plan, with one binary and one state."
date: 2026-10-25
---

Here's a job most of us have done more times than we'd like. Terraform creates three droplets. Then a script reads their addresses out of state, writes an Ansible inventory, and runs a playbook against it. When the playbook fails halfway, you have servers that exist and aren't configured, a state file that thinks everything's fine, and two tools that each know half the story.

Conn3x v0.1 is out, and it does that job as one thing.

## One plan

You describe the server and what goes on it side by side. The droplet is an ordinary resource from the DigitalOcean provider. What runs on it is a **circuit**, which is a playbook written in HCL:

```hcl
circuit "web" {
  hosts = { web1 = digitalocean_droplet.web.ipv4_address }

  ssh {
    user     = "root"
    host_key = tls_private_key.host.public_key_openssh
  }

  step "nginx" {
    package { name = "nginx" }
  }

  step "page" {
    file {
      path    = "/usr/share/nginx/html/index.html"
      content = "<h1>Hello from ${each.key}</h1>\n"
    }
  }
}
```

Run `conn3x plan` and you get the droplet that's about to be created, and under it the package and the file headed for a host whose address doesn't exist yet. One `apply` creates the droplet, waits for SSH, checks the host key it generated, and sets the server up. One state file remembers both.

There's no inventory to sync, because the address is an expression. There's no second run to forget, because there's only one.

## What's in it

v0.1 covers the work most playbooks spend their lines on. Files and templates, edits to a single line or a marked block, packages and their repositories, services and systemd timers, cron, users, groups and SSH keys, sysctl, mounts, the hostname and time zone, firewalld and ufw rules, SELinux booleans and file contexts, checksummed downloads, archives and git checkouts. It also does guarded commands, and reboots that wait for the host to come back.

Every plan reads the hosts before it says anything, so what it shows is a diff against what's there, line by line for files. Run it twice and the second plan says `No changes.` That's the first thing we check for every module.

It also notices what changed by hand. `conn3x drift` reports drift across the cloud and the hosts, and exits 2 when there's any, so a nightly job can tell you before the next apply quietly undoes someone's 3am fix.

## What it doesn't make you do

**Rewrite everything.** Conn3x is built on OpenTofu. Your providers, modules and state work as they are, and circuits sit next to them.

**Start from a blank page.** `conn3x convert ansible -i inventory site.yml` turns playbooks into circuits. It translates what it can show means the same thing, and leaves the rest in the output, commented, with the reason: a loop, a `when`, a Jinja filter. You'd rather finish those by hand than find out later the converter guessed.

**Install anything on your servers.** No Python, no agent. Conn3x connects over SSH, checks the host key every time, and runs plain shell commands as root or through sudo.

## How we test it

Each module runs end to end against Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13 on every change. The ones that need a real kernel, such as SELinux, firewalls, sysctl, mounts and reboots, run against real DigitalOcean droplets every night, in a plan that creates the droplets and configures them. Releases are signed with cosign and come with SBOMs and build provenance.

## It's early

This is v0.1. It runs on Linux and macOS and configures the Red Hat and Debian families. There's a lot we haven't built yet, and we'd rather hear what you need than guess.

[Get started in fifteen minutes](https://docs.conn3x.org/get-started), [read the release notes](https://github.com/conn3xorg/conn3x/releases/tag/v0.1.0), or tell us where it falls short in [Discussions](https://github.com/conn3xorg/conn3x/discussions).
