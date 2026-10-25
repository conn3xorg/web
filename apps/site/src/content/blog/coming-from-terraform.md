---
title: "Coming from Terraform"
description: "Keep your providers, modules and state. Conn3x adds one block for what happens after the server boots, and puts it in the same plan."
date: 2026-11-08
author: James Conway
image: /media/blog/coming-from-terraform/card.png
imageAlt: "A Terraform resource and a Conn3x circuit in one file, and the single plan that covers both."
---

You already have the hard part. A plan you review before anything changes, state that remembers what's out there, and a provider for everything you run. The gap is what happens after the machine boots, and today that gap gets filled with whatever's nearest: a `user_data` script, a `remote-exec` provisioner, or a `local-exec` that hands the addresses to Ansible.

This is the second of three short posts for the readers from [Why Conn3x is one tool](/blog/why-conn3x). This one is for you if Terraform, or OpenTofu, came first.

## What stays exactly the same

Conn3x is built on OpenTofu, so the configuration you have runs unchanged. The same `.tf` files, the same providers, the same modules. Run `conn3x init` and `conn3x plan` where you'd run `terraform init` and `terraform plan`.

Your state comes with you too. Conn3x reads and writes OpenTofu state, and OpenTofu reads Terraform state up to the versions it supports. The S3, GCS, azurerm, Kubernetes, Consul, PostgreSQL and HTTP backends are all built in. Back up your state before the first `conn3x apply`, the same as you would before any tool change.

## What you add

One block, beside the resource that creates the servers. A circuit says what should be on each host, and its `hosts` come straight from your resources:

```hcl
resource "digitalocean_droplet" "app" {
  for_each = local.servers
  name     = each.key
  image    = "rockylinux-10-x64"
  region   = "nyc3"
  size     = "s-1vcpu-1gb"
  # ...
}

circuit "app" {
  hosts = {
    for name, d in digitalocean_droplet.app : name => {
      address  = d.ipv4_address
      host_key = tls_private_key.host[name].public_key_openssh
    }
  }

  ssh {
    user = "root"
  }

  step "deploy_user" {
    user {
      name  = "deploy"
      shell = "/bin/bash"
    }
  }
}
```

That's the shape of the [DigitalOcean example](https://github.com/conn3xorg/conn3x/tree/main/examples/digitalocean), trimmed here to fit: the full one pins each server's host key, so even the first connection is checked.

## One plan for both layers

Here's what `conn3x plan` says about that example, before a single droplet exists:

```text
  # conn3x_authorized_key.app__deploy_key["app-1"] will be created
  # conn3x_user.app__deploy_user["app-1"] will be created
  # digitalocean_droplet.app["app-1"] will be created
  # tls_private_key.host["app-1"] will be created
  ...
Plan: 12 to add, 0 to change, 0 to destroy.
```

<figure class="clip" data-clip>
  <video src="/media/blog/coming-from-terraform/plan.mp4" poster="/media/blog/coming-from-terraform/plan.webp" width="1280" height="720" controls muted loop playsinline preload="metadata" aria-label="A terminal running conn3x plan on the DigitalOcean example: three host keys, three droplets, and a user and a key for each droplet, twelve changes in one plan."></video>
  <figcaption>A real <code>conn3x plan</code> of the DigitalOcean example, with the resource lines picked out.</figcaption>
  <button type="button" data-clip-toggle hidden>Pause</button>
</figure>

The droplets and what goes on them, in one review. Once the servers exist, the host steps show a line-by-line diff of what's on each one: the file that's different, the package that's missing.

## Where it replaces what you use today

<figure>
  <img src="/media/blog/coming-from-terraform/compare.png" width="1600" height="1950" loading="lazy" decoding="async" alt="A comparison of user_data, remote-exec provisioners, local-exec into Ansible, and a Conn3x circuit, on when each runs, whether the plan shows it, and whether drift shows up." />
  <figcaption>Four ways to configure a server from Terraform, side by side.</figcaption>
</figure>

<details>
<summary>Read the comparison as text</summary>

- **When it runs.** `user_data`: once, at first boot. Provisioners: when the resource is created. `local-exec` into Ansible: when the resource is created, or by hand. A Conn3x circuit: on every apply, when a step is out of date.
- **In the plan.** `user_data`: no, it's a blob of script. Provisioners: no. Ansible: no, it's a separate `--check --diff`. A circuit: yes, a diff per host, line by line for files.
- **Changing it later.** `user_data`: usually means a new server, or a hand edit. Provisioners: they don't rerun. Ansible: run the playbook again. A circuit: change the step and the next plan shows it.
- **Hand edits on the host.** `user_data` and provisioners: invisible. Ansible: seen when the playbook runs in check mode. A circuit: `conn3x drift`, which exits 2.
- **What you install.** `user_data` and provisioners: nothing more. Ansible: Ansible, and Python on the hosts. A circuit: one binary, nothing on the hosts.
- **State.** `user_data` and provisioners: none for what they did. Ansible: none for the hosts. A circuit: the same state as your resources.

</details>

**`user_data`** runs once, at first boot, and then it's done. Terraform never sees what it did, so if someone changes the server later, nothing tells you.

**Provisioners** run when the resource is created, not when you change what they'd do, and HashiCorp's own docs call them a last resort.

**`local-exec` into Ansible** works, and plenty of teams run it. It also means a second tool, an inventory to keep in step, and a second run nobody can preview in the same plan.

**A circuit** is checked on every plan. Conn3x reads the host, compares it with the configuration, and shows the difference before it changes anything. `conn3x drift` checks the cloud and the hosts together and exits 2 when something changed by hand.

## Try it beside what you have

Copy a working directory, back up its state, and add a circuit for one server you don't mind touching:

```sh
brew install conn3xorg/tap/conn3x
conn3x init
conn3x plan
```

[Use Conn3x with your Terraform configuration](https://docs.conn3x.org/guides/migrate-from-terraform) covers state and backends, and [Create and configure a server in one plan](https://docs.conn3x.org/guides/provision-and-configure) walks through a complete example. If a provider or backend you rely on doesn't behave, [tell us](https://github.com/conn3xorg/conn3x/issues).
