---
title: "Why Conn3x is one tool"
description: "Creating a server and setting it up are one job. Conn3x does it with one binary, one plan and one state. Here's why that matters."
date: 2026-10-26
author: James Conway
image: /media/blog/why-conn3x/card.png
imageAlt: "Left: Terraform and Ansible joined by glue scripts, an inventory file and two states. Right: one Conn3x plan and one state."
---

Ask anyone who runs Linux servers how a new one comes to life, and you'll hear the same two names. Terraform, or OpenTofu, makes the machine. Ansible sets it up. Both do their half well.

The trouble lives between them.

Somewhere there's a script that copies addresses from one tool into a file the other one reads. There's a `sleep 60` that somebody added because the playbook kept knocking before SSH was listening. There are two records of what's out there, and on a bad day they disagree. None of that is anyone's fault. It's what happens when one job gets split across two tools.

Our position is simple. We'll take one tool over two, every time, as long as it gets the job right every time. Conn3x is that tool.

## Where the hand-off hurts

If you've wired these two together, you've met most of these.

**The race at boot.** The cloud API says the server exists. SSH doesn't agree yet. So the pipeline grows a retry loop or a sleep, tuned by hand until it mostly works.

**The glue.** Addresses travel through `local-exec`, an inventory script or a dynamic inventory plugin. It's code nobody wanted to write, and it's the first thing to break when a provider renames an attribute.

**Two states, two previews.** Terraform keeps state for the cloud. Ansible keeps none for the hosts, so the closest thing to a plan for them is a separate `--check --diff` run. You read two outputs and trust that they describe the same change.

**The scale-down.** Shrink a pool from three servers to two and Terraform removes a machine. Whatever else knew about it, an inventory file or a group in a playbook, keeps pointing at an address that's gone until somebody notices.

## One plan

Conn3x is built on OpenTofu, so your providers, modules and state work as they always have. What it adds is the circuit: a playbook, written in HCL, that lives in the same configuration as the servers it sets up.

```hcl
resource "digitalocean_droplet" "app" {
  count    = 3
  name     = "app-${count.index}"
  image    = "rockylinux-10-x64"
  region   = "nyc3"
  size     = "s-1vcpu-1gb"
  ssh_keys = [var.ssh_key_id]
}

circuit "app" {
  hosts = { for d in digitalocean_droplet.app : d.name => d.ipv4_address }

  ssh {
    user             = "root"
    private_key_file = "~/.ssh/id_ed25519"
    # Conn3x checks every host key. The provisioning guide shows how
    # to pin the keys of servers that don't exist yet.
  }

  step "deploy_user" {
    user {
      name  = "deploy"
      shell = "/bin/bash"
    }
  }

  step "deploy_key" {
    authorized_key {
      user = "deploy"
      key  = file("~/.ssh/deploy.pub")
    }
  }
}
```

`conn3x plan` shows three droplets about to be created and, under them, the account and the key headed for each one. One `apply` creates the machines, keeps trying each one until SSH answers, checks its host key, and sets it up. One state file holds all of it.

Look at what's missing. There's no inventory, because `hosts` is an expression. There's no wait loop, because the circuit's `timeout` covers a server that's still booting. And there's no second run to forget, because there's only one.

Change `count` to 2 and the same plan removes `app-2` and drops its steps from state along with it. Nothing is left pointing at an address that's gone.

<figure class="clip" data-clip>
  <video src="/media/blog/why-conn3x/apply.mp4" poster="/media/blog/why-conn3x/apply.webp" width="1280" height="720" muted loop playsinline preload="metadata" aria-label="A terminal running conn3x apply: one plan creates a host and configures it, then a second plan reports no changes."></video>
  <figcaption>One apply, start to finish, recorded against a local test host. The second plan has nothing to do. <button type="button" data-clip-toggle hidden>Pause</button></figcaption>
</figure>

## What one tool changes

It's easier, and the reasons are boring in the best way. There's one binary to install, one language to read and one command to run. A new teammate learns HCL and a short list of modules, and they can follow the whole path from API call to running service.

It's also better, because one tool can see the whole picture. A plan is a diff against what's on the servers right now, line by line for files, next to the cloud changes that cause it. `conn3x drift` checks both layers and exits 2 when something changed by hand, so a scheduled job hears about a hand edit the morning after, not the next time someone applies. And there's nothing to install on the servers: no agent and no Python. Conn3x connects over SSH and runs plain shell commands, as root or through sudo.

<figure>
  <img src="/media/blog/why-conn3x/infographic.png" width="1600" height="2534" loading="lazy" decoding="async" alt="Infographic: the same deploy done with Terraform plus Ansible, with four hand-off points marked, and done with one Conn3x plan." />
  <figcaption>The same deploy, two ways. Every detail comes from the v0.2.2 README and docs.</figcaption>
</figure>

<details>
<summary>Read the infographic as text</summary>

- **The setup:** three Rocky Linux servers, a `deploy` user and its SSH key, done with Terraform and Ansible and then with one Conn3x plan.
- **Tools to install:** two tools plus Python, or one binary.
- **State files:** Terraform state plus none for the hosts, or one for both.
- **Hand-offs to maintain:** four, or none.
- **Create the servers:** `terraform apply`, or `conn3x apply` with the same providers.
- **Wait for SSH (hand-off A):** a sleep or retry loop tuned by hand, or the circuit's `timeout`, three minutes by default.
- **Pass the addresses (hand-off B):** `local-exec` or an inventory script writes `inventory.ini`, or `hosts` is an expression over the droplets.
- **Configure:** `ansible-playbook -i inventory.ini site.yml` with Python on both sides, or the same apply over SSH with host keys checked and no agent.
- **Preview (hand-off C):** `terraform plan` plus a separate `--check --diff` run, or one `conn3x plan`.
- **Remember:** Terraform state for the cloud and none for the hosts, or one state file.
- **Scale 3 to 2 (hand-off D):** a static inventory keeps listing the removed server, or the same plan drops its steps from state.
- **Catch hand edits:** run the playbook again in check mode, or `conn3x drift`, which exits 2 when something changed.

</details>

## If you live in Ansible

You already think in tasks, handlers and hosts, and circuits keep those ideas: steps run in order, handlers fire on change, and `each.key` is the host. You don't have to start from a blank page, either. `conn3x convert ansible -i inventory.ini -out site.tf site.yml` translates what it can show means the same thing and leaves the rest in the output, commented, with the reason.

## If you live in Terraform

You keep your providers, your modules and your state. Circuits sit next to the resources you already have, and the plan you know grows a section for what's about to change on the servers. The configuration layer you used to hand off to another tool becomes part of the same review.

## If you're choosing your first stack

Learn one thing. Conn3x configures Rocky Linux, RHEL, AlmaLinux, Fedora, Debian and Ubuntu today, and every Terraform and OpenTofu provider works, so what you learn carries over in both directions.

## Built in the open

Conn3x starts from OpenTofu and tracks its releases, and we're grateful to the OpenTofu and Terraform communities whose work makes provider compatibility possible. It's MPL-2.0, contributions need a DCO sign-off, and there's no CLA. Every module runs end to end against Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13 on every change, and releases are signed with cosign and ship with SBOMs and build provenance.

It's early, and the [v0.1](/blog/conn3x-v0-1) and [v0.2.2](https://github.com/conn3xorg/conn3x/releases/tag/v0.2.2) notes say exactly what's there.

## Try it

```sh
brew install conn3xorg/tap/conn3x
```

Or [download a release](https://docs.conn3x.org/install) for Linux. [Get started](https://docs.conn3x.org/get-started) takes about fifteen minutes. If Conn3x saves you a script, [star the repo](https://github.com/conn3xorg/conn3x) so the next person finds it, and tell us what you'd want next in [Discussions](https://github.com/conn3xorg/conn3x/discussions).
