---
title: Use Conn3x with Terraform or OpenTofu configuration
description: Your existing configuration works in Conn3x; add circuits beside it.
---

Conn3x is built on OpenTofu, so the configuration you have runs unchanged: the same providers, the same modules, the same `.tf` files. Run `conn3x init` and `conn3x plan` where you'd run `tofu` or `terraform`.

## Your state

Conn3x reads and writes OpenTofu state, and OpenTofu reads Terraform state up to its supported versions. Back up your state before the first `conn3x apply`, and point Conn3x at it the way your backend already does: the S3, GCS, azurerm, Kubernetes, Consul, PostgreSQL and HTTP backends are all included. Tencent COS and Alibaba OSS aren't, to keep the binary small; move that state to another backend with OpenTofu's `init -migrate-state` first.

## Add a circuit

Where you configure servers today with a separate tool, add a circuit beside the resource that creates them. It can live in any `.tf` file, or in a `.circuit.hcl` file in the same directory:

```hcl
circuit "app" {
  hosts = { for name, vm in aws_instance.app : name => vm.private_ip }

  ssh {
    user   = "ec2-user"
    become = true
  }

  step "agent" {
    package { name = "amazon-cloudwatch-agent" }
  }
}
```

The next plan shows the instances and the packages for them together. See [Create and configure a server in one plan](/guides/provision-and-configure) for a complete example.
