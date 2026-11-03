---
title: Provision and configure on Azure
description: Create two Ubuntu VMs on Azure and configure them in the same plan, with host keys checked from the first connection, then destroy them.
---

In this tutorial one configuration creates two Azure VMs running Ubuntu 24.04 and sets each one up: a `deploy` account with your public key. The resource group, the network, the VMs, their SSH host keys and the steps on each VM are planned and applied together, and live in one state file.

**Time:** 15 minutes.

:::caution[This tutorial costs money]
It creates two real VMs. Each `Standard_B2s_v2` VM costs $0.0832 an hour in `westus2` at [Azure's prices](https://azure.microsoft.com/pricing/details/virtual-machines/linux/), and each static public address $0.005 an hour. Two of each for an hour cost about 18 cents, plus a little for their disks. They keep costing money until you destroy them, so finish with [Destroy everything](#destroy-everything).
:::

## Prerequisites

- Conn3x v0.6.12 [installed](/install).
- An Azure subscription and the [`az` CLI](https://learn.microsoft.com/cli/azure/install-azure-cli). You need to be able to create resource groups, networks and VMs: `Contributor` on the subscription is enough.
- An SSH key at `~/.ssh/id_ed25519`, with its public half at `~/.ssh/id_ed25519.pub`. Conn3x logs in with it.
- Room for four vCPUs in `westus2`. A new subscription's policies can limit sizes and locations. If yours rejects these, change `size` and `location` in `main.tf`.

## Write the configuration

Make an empty directory and save this as `main.tf`:

```hcl
terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 5.0" }
    tls     = { source = "hashicorp/tls", version = "~> 4.0" }
  }
}

variable "admin_cidr" {
  type        = string
  description = "The address allowed to reach SSH, such as 203.0.113.10/32."
}

locals {
  servers = toset(["app-1", "app-2"])
}

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "tutorial" {
  name     = "conn3x-tutorial"
  location = "westus2"
}

resource "azurerm_virtual_network" "tutorial" {
  name                = "conn3x-tutorial"
  location            = azurerm_resource_group.tutorial.location
  resource_group_name = azurerm_resource_group.tutorial.name
  address_space       = ["10.10.0.0/16"]
}

resource "azurerm_subnet" "tutorial" {
  name                 = "conn3x-tutorial"
  resource_group_name  = azurerm_resource_group.tutorial.name
  virtual_network_name = azurerm_virtual_network.tutorial.name
  address_prefixes     = ["10.10.0.0/24"]
}

resource "azurerm_network_security_group" "tutorial" {
  name                = "conn3x-tutorial"
  location            = azurerm_resource_group.tutorial.location
  resource_group_name = azurerm_resource_group.tutorial.name

  security_rule {
    name                       = "ssh"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = var.admin_cidr
    destination_address_prefix = "*"
  }
}

resource "azurerm_subnet_network_security_group_association" "tutorial" {
  subnet_id                 = azurerm_subnet.tutorial.id
  network_security_group_id = azurerm_network_security_group.tutorial.id
}

resource "azurerm_public_ip" "app" {
  for_each            = local.servers
  name                = each.key
  location            = azurerm_resource_group.tutorial.location
  resource_group_name = azurerm_resource_group.tutorial.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_network_interface" "app" {
  for_each            = local.servers
  name                = each.key
  location            = azurerm_resource_group.tutorial.location
  resource_group_name = azurerm_resource_group.tutorial.name

  ip_configuration {
    name                          = "conn3x"
    subnet_id                     = azurerm_subnet.tutorial.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.app[each.key].id
  }
}

# Each server's SSH host key, made here and installed by cloud-init,
# so Conn3x can check it on the very first connection.
resource "tls_private_key" "host" {
  for_each  = local.servers
  algorithm = "ED25519"
}

resource "azurerm_linux_virtual_machine" "app" {
  for_each                        = local.servers
  name                            = each.key
  location                        = azurerm_resource_group.tutorial.location
  resource_group_name             = azurerm_resource_group.tutorial.name
  size                            = "Standard_B2s_v2"
  admin_username                  = "conn3x"
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.app[each.key].id]

  admin_ssh_key {
    username   = "conn3x"
    public_key = trimspace(file(pathexpand("~/.ssh/id_ed25519.pub")))
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "StandardSSD_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "ubuntu-24_04-lts"
    sku       = "server"
    version   = "latest"
  }

  custom_data = base64encode("#cloud-config\n${yamlencode({
    ssh_deletekeys = true
    ssh_keys = {
      ed25519_private = tls_private_key.host[each.key].private_key_openssh
      ed25519_public  = tls_private_key.host[each.key].public_key_openssh
    }
  })}")

  # The firewall goes on before anything can listen.
  depends_on = [azurerm_subnet_network_security_group_association.tutorial]
}

circuit "app" {
  hosts = {
    for name, vm in azurerm_linux_virtual_machine.app : name => {
      address  = vm.public_ip_address
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
  value = { for name, vm in azurerm_linux_virtual_machine.app : name => vm.public_ip_address }
}

output "known_hosts" {
  value = join("", [for name, vm in azurerm_linux_virtual_machine.app : "${vm.public_ip_address} ${tls_private_key.host[name].public_key_openssh}"])
}
```

The configuration does five things:

- **Creates one resource group** holding everything else, so `az group delete` is your way out if `conn3x destroy` ever can't finish.
- **Opens SSH to one address** with a network security group, attached to the subnet before any VM starts.
- **Generates a host key for each VM** with the `tls` provider, and hands it to the VM through cloud-init. Cloud-init writes the key before SSH starts on this image, so there's no wait before connecting.
- **Builds the circuit's `hosts` from the VMs.** Each host is a [host object](/reference/circuits/hosts#a-map-of-names-to-host-objects) with the VM's address and its pinned `host_key`. Conn3x accepts only that key, so even the first connection to a new VM is verified, and you don't need a `known_hosts` entry.
- **Configures each VM** with two steps: a [`user`](/modules/user) and an [`authorized_key`](/modules/authorized_key). Azure makes the `conn3x` admin user with your public key and sudo, so Conn3x logs in as that user with `become = true`.

`timeout = "5m"` keeps Conn3x retrying while a new VM boots.

## Set your credentials

Sign in, and make sure your subscription can use the two services. The `azurerm` provider uses your active subscription:

```sh
az login
az provider register --namespace Microsoft.Compute
az provider register --namespace Microsoft.Network
```

Pass your own address to the configuration:

```sh
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

`init` downloads two providers:

```text
Initializing provider plugins...
- terraform.io/builtin/conn3x is built in to Conn3x
- Finding hashicorp/tls versions matching "~> 4.0"...
- Finding hashicorp/azurerm versions matching "~> 5.0"...
- Installing hashicorp/tls v4.4.2...
- Installing hashicorp/azurerm v5.12.0...
```

Your versions may be newer. `init` writes them to `.terraform.lock.hcl`.

## Plan

```sh
conn3x plan
```

The plan covers the cloud and the hosts at once:

```text
  # azurerm_linux_virtual_machine.app["app-1"] will be created
  # azurerm_linux_virtual_machine.app["app-2"] will be created
  # azurerm_network_interface.app["app-1"] will be created
  # azurerm_network_interface.app["app-2"] will be created
  # azurerm_network_security_group.tutorial will be created
  # azurerm_public_ip.app["app-1"] will be created
  # azurerm_public_ip.app["app-2"] will be created
  # azurerm_resource_group.tutorial will be created
  # azurerm_subnet.tutorial will be created
  # azurerm_subnet_network_security_group_association.tutorial will be created
  # azurerm_virtual_network.tutorial will be created
  # conn3x_authorized_key.app__deploy_key["app-1"] will be created
  # conn3x_authorized_key.app__deploy_key["app-2"] will be created
  # conn3x_user.app__deploy_user["app-1"] will be created
  # conn3x_user.app__deploy_user["app-2"] will be created
  # tls_private_key.host["app-1"] will be created
  # tls_private_key.host["app-2"] will be created

Plan: 17 to add, 0 to change, 0 to destroy.
```

The VMs don't exist yet, so each step's address and host key are unknown until apply:

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

Type `yes` when asked. It took under two minutes when we ran it:

```text
Apply complete! Resources: 17 added, 0 changed, 0 destroyed.
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

`ssh` on your machine doesn't know these VMs yet. Answer `yes` at its first prompt and you've trusted whatever answered, which is the one thing Conn3x refused to do. You don't have to: the configuration made the keys, so it can tell `ssh` what to expect.

Write them to a file next to `main.tf`:

```sh
conn3x output -raw known_hosts > known_hosts
ssh-keygen -lf known_hosts
```

`ssh-keygen` prints one fingerprint for each VM:

```text
256 SHA256:Q+hD+puZ+h9eH5sp8ecjm0UoFHpGOToWBJzGcfGozYw 203.0.113.10 (ED25519)
256 SHA256:6k9h22xldln3q2bky1aiG6mO7EiVnGBsiUWpSXLIURk 203.0.113.11 (ED25519)
```

Log in as `deploy`, with `ssh` told to use only that file and to refuse any other key. Use an address from `conn3x output addresses`:

```sh
ssh -o UserKnownHostsFile=known_hosts -o StrictHostKeyChecking=yes \
  -i ~/.ssh/id_ed25519 deploy@203.0.113.10 \
  'whoami; . /etc/os-release; echo $PRETTY_NAME'
```

There's no prompt. If the VM presents a different key, `ssh` stops with `Host key verification failed.`. When it matches:

```text
deploy
Ubuntu 24.04.5 LTS
```

Run `conn3x plan` again. It reads the VMs from Azure and the steps from each VM, and reports no changes:

```text
No changes. Your infrastructure matches the configuration.
```

## Remove one VM

Take `app-2` out of `local.servers` in `main.tf`:

```hcl
locals {
  servers = toset(["app-1"])
}
```

Run `conn3x plan`, then `conn3x apply`. The same plan destroys the `app-2` VM, its network interface, public address and host key, and removes its two steps. The `authorized_key` step defaults to `on_remove = "delete"`, so Conn3x deletes the deploy key from `app-2` before the VM goes. See [Removal](/reference/circuits/removal) for each module's default.

```text
Plan: 0 to add, 0 to change, 6 to destroy.
```

## Destroy everything

Destroy everything the configuration created, and type `yes`:

```sh
conn3x destroy
```

This deletes the resource group and everything in it, which stops the charges. Check that it's gone:

```sh
az group exists -n conn3x-tutorial
```

That prints `false`. The first network in a region makes Azure create a free `NetworkWatcherRG` group of its own, outside this configuration, and `destroy` leaves it behind.

The state file holds each VM's private host key, so delete it as well, with your `known_hosts` file, which no longer points at anything:

```sh
rm -f terraform.tfstate terraform.tfstate.backup known_hosts
```

For a configuration you keep, turn on [state encryption](https://opentofu.org/docs/language/state/encryption/) or store state where you'd store a secret. The private host key also sits in each VM's `custom_data`: Azure's API won't hand it back, but root on the VM can read it.

## Next steps

- [Reach hosts through a bastion](/tutorials/bastion), for servers without a public address.
- [Create and configure a server in one plan](/guides/provision-and-configure) adds nginx and a firewall to a single server.
- [Hosts](/reference/circuits/hosts) covers building `hosts` from resources.
