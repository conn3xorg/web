---
title: Find hosts by cloud tag
description: Build a circuit's hosts from the VMs that carry a tag in AWS or Azure, so a new VM is configured on the next apply.
---

Ansible finds hosts by tag with a dynamic inventory plugin, such as `amazon.aws.aws_ec2`. In Conn3x there's nothing extra to install. The cloud provider's data sources look the VMs up when you plan, and a `for` expression turns them into the circuit's `hosts`. Tag a new VM `role = web`, run `conn3x apply`, and it's configured with the rest.

Each recipe below makes a map of VM names to addresses, `local.web_hosts`, and this circuit uses it unchanged:

```hcl
circuit "web" {
  hosts = local.web_hosts

  ssh {
    user   = "ubuntu"
    become = true
  }

  step "motd" {
    file {
      path    = "/etc/motd"
      content = "${each.key} was found by its role tag.\n"
    }
  }
}
```

Both recipes were run against real accounts: two VMs tagged `role = web`, found by the tag alone and configured over SSH.

## AWS

`aws_instances` returns the IDs and addresses of the running instances with a tag. A second lookup per ID reads each one's `Name` tag, so hosts are called `web1` and `web2` rather than `i-08d154f7a22b60139`:

```hcl
data "aws_instances" "web" {
  instance_tags        = { role = "web" }
  instance_state_names = ["running"]
}

data "aws_instance" "web" {
  for_each    = toset(data.aws_instances.web.ids)
  instance_id = each.key
}

locals {
  web_hosts = { for id, i in data.aws_instance.web : i.tags["Name"] => i.public_ip }
}
```

Every instance needs a distinct `Name` tag, since a circuit's hosts are a map. To key by instance ID instead, skip the second data source: `zipmap(data.aws_instances.web.ids, data.aws_instances.web.public_ips)`.

## Azure

`azurerm_resources` finds every resource of a type with the tags you give, across the subscription. It returns names and resource groups but no addresses, so `azurerm_virtual_machine` reads each VM's:

```hcl
data "azurerm_resources" "web" {
  type          = "Microsoft.Compute/virtualMachines"
  required_tags = { role = "web" }
}

data "azurerm_virtual_machine" "web" {
  for_each            = { for r in data.azurerm_resources.web.resources : r.name => r }
  name                = each.value.name
  resource_group_name = each.value.resource_group_name
}

locals {
  web_hosts = { for name, vm in data.azurerm_virtual_machine.web : name => vm.public_ip_address }
}
```

Azure VM names are unique within a resource group, not a subscription. If two groups each have a `web1`, key by `"${r.resource_group_name}/${r.name}"` instead.

## Private addresses

Over a VPN, or through a [bastion](/guides/bastions/), use the private address: `i.private_ip` in AWS, `vm.private_ip_address` in Azure. Host names and keys stay the same.

## Host keys

Conn3x always checks host keys, so a VM it hasn't met stops the plan until its key is known. For a VM you just made, either pin the key in a host object, read from where your cloud publishes it, or add it to `known_hosts` from a network you trust:

```shell
ssh-keyscan 203.0.113.10 203.0.113.11 >> ~/.ssh/known_hosts
```

Wait until the VM has finished its first boot. On many cloud images cloud-init writes the host keys during first boot, so a key scanned too early can be replaced, and Conn3x will then say it changed. See [the ssh block](/reference/circuits/ssh/) for `host_key` and `known_hosts_file`.

## When the list changes

The data sources are read on every plan. A VM that gains the tag is added, and its steps are created. A VM that loses the tag, or is deleted, drops out of `hosts`, and its steps are removed from state. Conn3x doesn't log in to undo them, unless a step sets `on_remove`. If an apply should never shrink the fleet by surprise, check the plan for steps it removes before you apply.
