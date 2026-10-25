---
title: Create and configure a server in one plan
description: A DigitalOcean droplet and the circuit that configures it, planned and applied together.
---

The point of Conn3x is that creating a server and setting it up are one plan. Here a DigitalOcean droplet is created, and a circuit configures it the moment it boots, using the droplet's address and a host key generated in the same plan, so even the first SSH connection is verified.

You need a DigitalOcean API token in `DIGITALOCEAN_TOKEN` and an SSH key pair. Droplets cost money while they run, so `conn3x destroy` when you're done.

```hcl
terraform {
  required_providers {
    digitalocean = { source = "digitalocean/digitalocean", version = "~> 2.0" }
    tls          = { source = "hashicorp/tls", version = "~> 4.0" }
  }
}

# The droplet's SSH host key, generated here and installed by cloud-init,
# so Conn3x can check it on the first connection.
resource "tls_private_key" "host" {
  algorithm = "ED25519"
}

resource "digitalocean_ssh_key" "me" {
  name       = "conn3x-example"
  public_key = file("~/.ssh/id_ed25519.pub")
}

resource "digitalocean_droplet" "web" {
  name     = "web1"
  image    = "rockylinux-10-x64"
  size     = "s-1vcpu-1gb"
  region   = "nyc3"
  ssh_keys = [digitalocean_ssh_key.me.fingerprint]

  user_data = "#cloud-config\n${yamlencode({
    ssh_deletekeys = true
    ssh_keys = {
      ed25519_private = tls_private_key.host.private_key_openssh
      ed25519_public  = tls_private_key.host.public_key_openssh
    }
  })}"
}

circuit "web" {
  hosts = { web1 = digitalocean_droplet.web.ipv4_address }

  ssh {
    user             = "root"
    private_key_file = "~/.ssh/id_ed25519"
    host_key         = tls_private_key.host.public_key_openssh
    timeout          = "5m"
  }

  step "nginx" {
    package { name = "nginx" }
  }

  step "firewall" {
    package { name = "firewalld" }
  }

  step "firewall_up" {
    service {
      name    = "firewalld"
      state   = "started"
      enabled = true
    }
  }

  step "http" {
    firewalld { service = "http" }
  }

  step "page" {
    file {
      path    = "/usr/share/nginx/html/index.html"
      content = "<h1>Hello from ${each.key}</h1>\n"
    }
  }

  step "running" {
    service {
      name    = "nginx"
      state   = "started"
      enabled = true
    }
  }
}

output "ip" {
  value = digitalocean_droplet.web.ipv4_address
}
```

`conn3x plan` shows the droplet and every step together. The steps' `host` is `(known after apply)`, because the droplet doesn't exist yet. `conn3x apply` creates it, waits for SSH to answer (that's what `timeout` is for), then runs the steps.

The private host key ends up in state, so turn on state encryption, or keep the state somewhere you'd keep a secret. This example is the one Conn3x's own test suite runs against real droplets every night.
