---
title: Provision and configure on Google Cloud
description: Create two Debian instances on Google Cloud and configure them in the same plan, with host keys checked from the first connection, then destroy them.
---

In this tutorial one configuration creates two Compute Engine instances running Debian 13 and sets each one up: a `deploy` account with your public key. The network, the instances, their SSH host keys and the steps on each instance are planned and applied together, and live in one state file.

**Time:** 15 minutes.

:::caution[This tutorial costs money]
It creates two real instances, each with a disk and a public address. Each `e2-small` costs $0.0168 an hour in `us-central1` at [Google Cloud's prices](https://cloud.google.com/products/compute/pricing/general-purpose), and each [public address](https://cloud.google.com/vpc/network-pricing#ipaddress) $0.005 an hour. Two of each for an hour cost about 4.4 cents, plus a little for their disks. They keep costing money until you destroy them, so finish with [Destroy everything](#destroy-everything).
:::

## Prerequisites

- Conn3x v0.6.12 [installed](/install).
- A Google Cloud project with billing on, and the [`gcloud` CLI](https://cloud.google.com/sdk/docs/install). You need to be able to create instances, networks and firewall rules in the project: `roles/compute.admin` is enough.
- An SSH key at `~/.ssh/id_ed25519`, with its public half at `~/.ssh/id_ed25519.pub`. Conn3x logs in with it.

## Write the configuration

Make an empty directory and save this as `main.tf`:

```hcl
terraform {
  required_providers {
    google = { source = "hashicorp/google", version = "~> 7.0" }
    time   = { source = "hashicorp/time", version = "~> 0.13" }
    tls    = { source = "hashicorp/tls", version = "~> 4.0" }
  }
}

variable "project" {
  type        = string
  description = "ID of the Google Cloud project to create the instances in."
}

variable "admin_cidr" {
  type        = string
  description = "The address allowed to reach SSH, such as 203.0.113.10/32."
}

locals {
  servers = toset(["app-1", "app-2"])
}

provider "google" {
  project = var.project
  region  = "us-central1"
  zone    = "us-central1-a"
}

# A network of its own, so the default network's allow-SSH-from-anywhere
# rule doesn't apply.
resource "google_compute_network" "tutorial" {
  name                    = "conn3x-tutorial"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "tutorial" {
  name          = "conn3x-tutorial"
  network       = google_compute_network.tutorial.id
  ip_cidr_range = "10.10.0.0/24"
}

resource "google_compute_firewall" "ssh" {
  name          = "conn3x-tutorial-ssh"
  network       = google_compute_network.tutorial.id
  source_ranges = [var.admin_cidr]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

# Each server's SSH host key, made here and installed by its startup script,
# so Conn3x can check it on the very first connection.
resource "tls_private_key" "host" {
  for_each  = local.servers
  algorithm = "ED25519"
}

resource "google_compute_instance" "app" {
  for_each     = local.servers
  name         = each.key
  machine_type = "e2-small"

  # Delete the firewall rule last, so destroy can still clean up over SSH.
  depends_on = [google_compute_firewall.ssh]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-13"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.tutorial.id
    access_config {}
  }

  metadata = {
    # Keys added to the whole project don't get onto this instance.
    block-project-ssh-keys = true
    enable-oslogin         = "FALSE"

    startup-script = <<-EOT
      #!/bin/bash
      set -eu
      [ -e /var/lib/conn3x-ready ] && exit 0
      rm -f /etc/ssh/ssh_host_*
      echo ${base64encode(tls_private_key.host[each.key].private_key_openssh)} | base64 -d > /etc/ssh/ssh_host_ed25519_key
      chmod 600 /etc/ssh/ssh_host_ed25519_key
      echo ${base64encode(tls_private_key.host[each.key].public_key_openssh)} | base64 -d > /etc/ssh/ssh_host_ed25519_key.pub
      useradd -m -s /bin/bash conn3x
      install -d -m 700 -o conn3x -g conn3x /home/conn3x/.ssh
      echo ${base64encode(file(pathexpand("~/.ssh/id_ed25519.pub")))} | base64 -d > /home/conn3x/.ssh/authorized_keys
      chown conn3x: /home/conn3x/.ssh/authorized_keys
      chmod 600 /home/conn3x/.ssh/authorized_keys
      echo 'conn3x ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/conn3x
      chmod 440 /etc/sudoers.d/conn3x
      systemctl restart ssh
      touch /var/lib/conn3x-ready
    EOT
  }
}

# Long enough for the startup script. SSH starts first, with the image's own
# host key, and Conn3x rightly stops if it meets that one.
resource "time_sleep" "boot" {
  for_each        = google_compute_instance.app
  create_duration = "90s"
  triggers = {
    address = each.value.network_interface[0].access_config[0].nat_ip
  }
}

circuit "app" {
  hosts = {
    for name, b in time_sleep.boot : name => {
      address  = b.triggers["address"]
      host_key = tls_private_key.host[name].public_key_openssh
    }
  }

  ssh {
    user             = "conn3x"
    private_key_file = "~/.ssh/id_ed25519"
    become           = true
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
  value = { for name, b in time_sleep.boot : name => b.triggers["address"] }
}

output "known_hosts" {
  value = join("", [for name, b in time_sleep.boot : "${b.triggers["address"]} ${tls_private_key.host[name].public_key_openssh}"])
}
```

The configuration does five things:

- **Gives the instances a network of their own**, with SSH open to one address. The rules on your project's `default` network, which let SSH in from anywhere, don't apply.
- **Generates a host key for each instance** with the `tls` provider, and hands it over in a startup script. The instance replaces the image's host keys with that one. Debian's images on Google Cloud have no cloud-init, which is why this is a script rather than the `ssh_keys` setting the [DigitalOcean tutorial](/tutorials/digitalocean) uses.
- **Makes a `conn3x` user** with your public key and sudo. Debian's image keeps root out of SSH, so Conn3x logs in as this user and uses `become = true`.
- **Waits 90 seconds, then builds the circuit's `hosts`.** SSH starts before the startup script finishes, still holding the image's own key. Each host is a [host object](/reference/circuits/hosts#a-map-of-names-to-host-objects) with a pinned `host_key`, and Conn3x accepts only that key, so a connection that came too early would be refused. If an apply stops with a host key error, run it again.
- **Configures each instance** with two steps: a [`user`](/modules/user) and an [`authorized_key`](/modules/authorized_key).

## Set your credentials

Sign in. The project also needs the [Compute Engine API](https://console.cloud.google.com/apis/library/compute.googleapis.com) turned on:

```sh
gcloud auth application-default login
```

Pass the project ID and your own address to the configuration:

```sh
export TF_VAR_project=<your project ID>
export TF_VAR_admin_cidr="$(curl -4 -s https://ifconfig.me)/32"
```

The `deploy` user gets the public key in `deploy.pub`, next to `main.tf`. Copy yours there, or any public key you want the account to accept:

```sh
cp ~/.ssh/id_ed25519.pub deploy.pub
```

## Initialize

```sh
conn3x init
```

`init` downloads three providers:

```text
Initializing provider plugins...
- terraform.io/builtin/conn3x is built in to Conn3x
- Finding hashicorp/google versions matching "~> 7.0"...
- Finding hashicorp/tls versions matching "~> 4.0"...
- Finding hashicorp/time versions matching "~> 0.13"...
- Installing hashicorp/google v7.46.2...
- Installing hashicorp/tls v4.4.2...
- Installing hashicorp/time v0.14.2...
```

Your versions may be newer. `init` writes them to `.terraform.lock.hcl`.

## Plan

```sh
conn3x plan
```

The plan covers the cloud and the hosts at once:

```text
  # conn3x_authorized_key.app__deploy_key["app-1"] will be created
  # conn3x_authorized_key.app__deploy_key["app-2"] will be created
  # conn3x_user.app__deploy_user["app-1"] will be created
  # conn3x_user.app__deploy_user["app-2"] will be created
  # google_compute_firewall.ssh will be created
  # google_compute_instance.app["app-1"] will be created
  # google_compute_instance.app["app-2"] will be created
  # google_compute_network.tutorial will be created
  # google_compute_subnetwork.tutorial will be created
  # time_sleep.boot["app-1"] will be created
  # time_sleep.boot["app-2"] will be created
  # tls_private_key.host["app-1"] will be created
  # tls_private_key.host["app-2"] will be created

Plan: 13 to add, 0 to change, 0 to destroy.
```

The instances don't exist yet, so each step's address and host key are unknown until apply:

```text
      + ssh {
          + become           = true
          + host             = (known after apply)
          + host_key         = (known after apply)
          + private_key_file = "~/.ssh/id_ed25519"
          + timeout          = "5m"
          + user             = "conn3x"
        }
```

## Apply

```sh
conn3x apply
```

Type `yes` when asked. It took a little under two and a half minutes when we ran it, 90 seconds of that the wait:

```text
Apply complete! Resources: 13 added, 0 changed, 0 destroyed.
```

List the addresses:

```sh
conn3x output addresses
```

```text
{
  "app-1" = "203.0.113.10"
  "app-2" = "203.0.113.11"
}
```

The addresses on this page are examples. Yours are real, public ones.

## Check the host keys yourself

`ssh` on your machine doesn't know these instances yet. Answer `yes` at its first prompt and you've trusted whatever answered, which is the one thing Conn3x refused to do. You don't have to: the configuration made the keys, so it can tell `ssh` what to expect.

Write them to a file next to `main.tf`:

```sh
conn3x output -raw known_hosts > known_hosts
ssh-keygen -lf known_hosts
```

`ssh-keygen` prints one fingerprint for each instance:

```text
256 SHA256:2REw/97uc0NXTqOFXG4lqO1SSLQl+i04cxvb/nR7/SY 203.0.113.10 (ED25519)
256 SHA256:7m4fnJ80zcmV+AIdpcVAVdCVdQe4PUlzfZ3z+UYHYDg 203.0.113.11 (ED25519)
```

Log in as `deploy`, with `ssh` told to use only that file and to refuse any other key. Use an address from `conn3x output addresses`:

```sh
ssh -o UserKnownHostsFile=known_hosts -o StrictHostKeyChecking=yes \
  -i ~/.ssh/id_ed25519 deploy@203.0.113.10 \
  'whoami; . /etc/os-release; echo $PRETTY_NAME'
```

There's no prompt. If the instance presents a different key, `ssh` stops with `Host key verification failed.`. When it matches:

```text
deploy
Debian GNU/Linux 13 (trixie)
```

Run `conn3x plan` again. It reads the instances from Google Cloud and the steps from each instance, and reports no changes:

```text
No changes. Your infrastructure matches the configuration.
```

## Remove one instance

Take `app-2` out of `local.servers` in `main.tf`:

```hcl
locals {
  servers = toset(["app-1"])
}
```

Run `conn3x plan`, then `conn3x apply`. The same plan destroys the `app-2` instance, its wait and its host key, and removes its two steps. The `authorized_key` step defaults to `on_remove = "delete"`, so Conn3x deletes the deploy key from `app-2` before the instance goes. See [Removal](/reference/circuits/removal) for each module's default.

```text
Plan: 0 to add, 0 to change, 5 to destroy.
```

## Destroy everything

Destroy everything the configuration created, and type `yes`:

```sh
conn3x destroy
```

This deletes the instances and their disks, which stops the charges. Check that none are left:

```sh
gcloud compute instances list --project <your project ID>
gcloud compute networks list --project <your project ID> --filter='name=conn3x-tutorial'
```

Both print `Listed 0 items.`, unless the project has other instances of its own.

The state file holds each instance's private host key, so delete it as well, with your `known_hosts` file, which no longer points at anything:

```sh
rm -f terraform.tfstate terraform.tfstate.backup known_hosts
```

For a configuration you keep, turn on [state encryption](https://opentofu.org/docs/language/state/encryption/) or store state where you'd store a secret. The private host key also sits in each instance's metadata: anything running on the instance can read it, and so can anyone who can view the instance in your project.

## Next steps

- [Reach hosts through a bastion](/tutorials/bastion), for servers without a public address.
- [Create and configure a server in one plan](/guides/provision-and-configure) adds nginx and a firewall to a single server.
- [Hosts](/reference/circuits/hosts) covers building `hosts` from resources.
