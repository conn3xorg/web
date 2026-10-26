---
title: Provision and configure on DigitalOcean
description: Create three DigitalOcean droplets and configure them in the same plan, with host keys checked from the first connection, then destroy them.
---

In this tutorial one configuration creates three DigitalOcean droplets and sets each one up: a `deploy` account with your public key. The droplets, their SSH host keys and the steps on each droplet are planned and applied together, and live in one state file.

**Time:** 15 minutes.

:::caution[This tutorial costs money]
It creates three real droplets. Each `s-1vcpu-1gb` droplet costs $0.00893 an hour ($6 a month) at [DigitalOcean's prices](https://www.digitalocean.com/pricing/droplets), and DigitalOcean bills by the second. Three droplets for an hour cost about 3 cents. They keep costing money until you destroy them, so finish with [Destroy the droplets](#destroy-the-droplets).
:::

## Prerequisites

- Conn3x v0.6.3 [installed](/install).
- A DigitalOcean account and a [personal access token](https://docs.digitalocean.com/reference/api/create-personal-access-token/) with write access.
- An SSH key added to your DigitalOcean account, with its private half at `~/.ssh/id_ed25519`. Conn3x logs in to the droplets as `root` with it.
- Its ID or fingerprint, from **Settings > Security** in the DigitalOcean control panel, or from `doctl compute ssh-key list`.
- `git`.

## Get the example

The configuration is the `digitalocean` example in the Conn3x repository:

```sh
git clone --depth 1 --branch v0.6.3 https://github.com/conn3xorg/conn3x
cd conn3x/examples/digitalocean
```

`main.tf` holds the whole configuration:

```hcl
terraform {
  required_providers {
    digitalocean = { source = "digitalocean/digitalocean" }
  }
}

variable "ssh_key_id" {
  type        = string
  description = "ID or fingerprint of an SSH key already in your DigitalOcean account."
}

locals {
  servers = toset(["app-1", "app-2", "app-3"])
}

# Each server's SSH host key, made here and installed by cloud-init,
# so Conn3x can check it on the very first connection.
resource "tls_private_key" "host" {
  for_each  = local.servers
  algorithm = "ED25519"
}

resource "digitalocean_droplet" "app" {
  for_each = local.servers
  name     = each.key
  image    = "rockylinux-10-x64"
  region   = "nyc3"
  size     = "s-1vcpu-1gb"
  ssh_keys = [var.ssh_key_id]

  user_data = "#cloud-config\n${yamlencode({
    ssh_deletekeys = true
    ssh_keys = {
      ed25519_private = tls_private_key.host[each.key].private_key_openssh
      ed25519_public  = tls_private_key.host[each.key].public_key_openssh
    }
  })}"
}

circuit "app" {
  hosts = {
    for name, d in digitalocean_droplet.app : name => {
      address  = d.ipv4_address
      host_key = tls_private_key.host[name].public_key_openssh
    }
  }

  ssh {
    user             = "root"
    private_key_file = "~/.ssh/id_ed25519"
    timeout          = "5m"
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
      key  = file("${path.module}/deploy.pub")
    }
  }
}

output "addresses" {
  value = { for name, d in digitalocean_droplet.app : name => d.ipv4_address }
}
```

The configuration does four things:

- **Generates a host key for each droplet** with the `tls` provider, and hands it to the droplet through cloud-init. The droplet starts with that key instead of making its own.
- **Creates the droplets** with the `digitalocean` provider, one for each name in `local.servers`.
- **Builds the circuit's `hosts` from the droplets.** Each host is a [host object](/reference/circuits/hosts#a-map-of-names-to-host-objects) with the droplet's address and its pinned `host_key`. Conn3x accepts only that key, so even the first connection to a new droplet is verified, and you don't need a `known_hosts` entry.
- **Configures each droplet** with two steps: a [`user`](/modules/user) and an [`authorized_key`](/modules/authorized_key).

`timeout = "5m"` keeps Conn3x retrying while a new droplet boots, so there's no separate wait step.

## Set your credentials

Export your token, so the `digitalocean` provider can read it:

```sh
export DIGITALOCEAN_TOKEN=dop_v1_...
```

The `deploy` user gets the public key in `deploy.pub`, next to `main.tf`. Copy yours there, or any public key you want the account to accept:

```sh
cp ~/.ssh/id_ed25519.pub deploy.pub
```

## Initialize

```sh
conn3x init
```

This time `init` downloads two providers:

```text
Initializing provider plugins...
- terraform.io/builtin/conn3x is built in to Conn3x
- Finding latest version of hashicorp/tls...
- Finding latest version of digitalocean/digitalocean...
- Installing hashicorp/tls v4.4.2...
- Installing digitalocean/digitalocean v2.106.0...
```

Your versions may be newer. `init` writes them to `.terraform.lock.hcl`.

## Plan

Pass your SSH key's ID or fingerprint as `ssh_key_id`:

```sh
conn3x plan -var ssh_key_id=<your key ID or fingerprint>
```

The plan covers both layers at once:

```text
  # conn3x_authorized_key.app__deploy_key["app-1"] will be created
  # conn3x_authorized_key.app__deploy_key["app-2"] will be created
  # conn3x_authorized_key.app__deploy_key["app-3"] will be created
  # conn3x_user.app__deploy_user["app-1"] will be created
  # conn3x_user.app__deploy_user["app-2"] will be created
  # conn3x_user.app__deploy_user["app-3"] will be created
  # digitalocean_droplet.app["app-1"] will be created
  # digitalocean_droplet.app["app-2"] will be created
  # digitalocean_droplet.app["app-3"] will be created
  # tls_private_key.host["app-1"] will be created
  # tls_private_key.host["app-2"] will be created
  # tls_private_key.host["app-3"] will be created

Plan: 12 to add, 0 to change, 0 to destroy.
```

The droplets don't exist yet, so each step's connection details are unknown until apply:

```text
      + ssh {
          + host             = (known after apply)
          + host_key         = (known after apply)
          + private_key_file = "~/.ssh/id_ed25519"
          + timeout          = "5m"
          + user             = "root"
        }
```

## Apply

```sh
conn3x apply -var ssh_key_id=<your key ID or fingerprint>
```

Type `yes` when asked. Conn3x generates the host keys, creates the droplets, waits for each one to answer on SSH, then creates the user and installs the key.

When it finishes, the `addresses` output lists each droplet's public address:

```sh
conn3x output addresses
```

Log in as `deploy` to check the account. Your `~/.ssh/known_hosts` doesn't have the droplets' keys, so `ssh` asks you to confirm the fingerprint. Conn3x didn't need to: it already had the key from the plan.

Run `conn3x plan -var ssh_key_id=<your key ID or fingerprint>` again. It reads the droplets from DigitalOcean and the steps from each droplet, and reports no changes.

## Remove one droplet

Take `app-3` out of `local.servers` in `main.tf`:

```hcl
locals {
  servers = toset(["app-1", "app-2"])
}
```

Plan and apply again. The same plan destroys the `app-3` droplet and its host key, and removes its two steps. The `authorized_key` step defaults to `on_remove = "delete"`, so Conn3x deletes the deploy key from `app-3` before the droplet goes. See [Removal](/reference/circuits/removal) for each module's default.

## Destroy the droplets

Destroy everything the configuration created, and type `yes`:

```sh
conn3x destroy -var ssh_key_id=<your key ID or fingerprint>
```

This deletes the droplets, which stops the charges. Check the **Droplets** page in the DigitalOcean control panel to confirm none are left. `destroy` doesn't remove the SSH key from your DigitalOcean account, because the configuration didn't create it.

The state file holds each droplet's private host key, so delete it as well:

```sh
rm -f terraform.tfstate terraform.tfstate.backup
```

For a configuration you keep, turn on [state encryption](https://opentofu.org/docs/language/state/encryption/) or store state where you'd store a secret.

## Next steps

- [Reach hosts through a bastion](/tutorials/bastion), for servers without a public address.
- [Create and configure a server in one plan](/guides/provision-and-configure) adds nginx and a firewall to a single droplet.
- [Hosts](/reference/circuits/hosts) covers building `hosts` from resources.
