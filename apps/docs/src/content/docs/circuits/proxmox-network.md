---
title: Proxmox VE network
description: "Manages a Proxmox VE node's bridges, VLAN interfaces, SDN zones and VNets through the Proxmox API."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-proxmox-network at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/proxmox-network/grade.svg)](https://conn3x.org/circuits/proxmox-network/grade)

A Conn3x circuit for the network side of a Proxmox VE node: Linux bridges, VLAN-aware ones by default, VLAN interfaces that give the node an address on a VLAN, and SDN zones and VNets that guests pick by name instead of by bridge and tag. It's the part of a homelab that usually lives only in **System > Network** and **Datacenter > SDN**, until a reinstall makes you remember it all.

It works through the Proxmox API with the [bpg/proxmox](https://registry.opentofu.org/providers/bpg/proxmox) provider, and pairs with [circuit-proxmox](/circuits/proxmox), which installs Proxmox VE on Debian 13 in the first place.

## Usage

```hcl
terraform {
  required_providers {
    proxmox = {
      source = "bpg/proxmox"
    }
  }
}

variable "api_token" {
  type      = string
  ephemeral = true
  sensitive = true
}

provider "proxmox" {
  endpoint  = "https://pve1.lab.example.com:8006/"
  api_token = var.api_token
}

module "network" {
  source = "github.com/conn3xorg/circuit-proxmox-network?ref=v0.1.0"

  node_name = "pve1"

  # A second NIC, eno2, cabled to a switch trunk port.
  bridges = {
    vmbr1 = { ports = ["eno2"], comment = "VLAN trunk" }
  }

  # The node's own address on the IoT VLAN, for a backup target or a DNS server there.
  vlan_interfaces = {
    iot = { interface = "vmbr1", vlan = 20, address = "10.20.0.2/24" }
  }

  sdn_zones = {
    trunk = { type = "vlan", bridge = "vmbr1" }
    lab   = {}
  }

  vnets = {
    iot   = { zone = "trunk", tag = 20, alias = "IoT" }
    guest = { zone = "trunk", tag = 30, alias = "Guest Wi-Fi" }
    sandbox = {
      zone    = "lab"
      subnets = { "10.50.0.0/24" = { gateway = "10.50.0.1", snat = true } }
    }
  }
}
```

Set `TF_VAR_api_token` to a token such as `root@pam!tofu=xxxxxxxx-...` and run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`, and `conn3x drift` tells you when someone has changed a bridge or a VNet by hand since. Then give a guest `bridge=iot` instead of `bridge=vmbr1,tag=20`.

CI uses a token made with `pveum user token add root@pam tofu --privsep 0`, which has root's rights. A narrower token works too, but mind the provider's warning: without `SDN.Audit` or `SDN.Use`, Proxmox hides bridges from the token, and the provider fails with `interface not found` right after creating one. Privilege-separated tokens need that grant on the token itself.

### Don't touch the bridge you're on

On most nodes `vmbr0` carries the address you reach the node on. Every change here reloads the node's network straight away, so a wrong port list or address on that bridge cuts you off mid-apply, and there's no automatic undo. The circuit refuses to manage `vmbr0` unless you set `manage_vmbr0 = true`. Other bridges aren't guarded, so check `ports` before an apply that moves a NIC you're using.

## What it does

1. Creates each bridge in `bridges`, with its ports, VLAN awareness (on by default, carrying VLANs 2 to 4094), an optional address, MTU and comment, and reloads the node's network. No gateway: the node's default route stays where it is.
2. Creates each VLAN interface in `vlan_interfaces`, named `<interface>.<vlan>`, with an optional address, after the bridges.
3. With `sdn_zones`, creates each zone limited to `node_name`: `simple` zones, which give each VNet its own bridge routed by the node, or `vlan` zones, which make each VNet a VLAN on a VLAN-aware bridge.
4. Creates each VNet, and the subnets in it. In a simple zone the node takes the subnet's gateway address, and `snat` lets guests out through the node's own address.
5. Applies SDN, the **Apply** button in the GUI, whenever a zone, VNet or subnet changes, including when an apply puts back a change made by hand. When everything SDN is removed, it applies once more on the way out.

It doesn't do bonds, the node's firewall, DHCP or IPAM beyond Proxmox's built-in defaults, EVPN or VXLAN zones, or clusters. bpg/proxmox has resources for most of those, and they sit fine next to this circuit.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `node_name` | string | Required | The node the bridges and VLAN interfaces go on, such as `"pve1"`. SDN zones are limited to it too. |
| `bridges` | map(object) | `{}` | Linux bridges by name (at most 10 letters, digits and underscores, starting with a letter), each with `ports`, `vlan_aware` (default `true`), `vids` (default `"2-4094"`), `address` (IPv4 CIDR), `mtu` and `comment`. |
| `manage_vmbr0` | bool | `false` | Allow `bridges` to include `vmbr0`. |
| `vlan_interfaces` | map(object) | `{}` | VLAN interfaces by any label, each with `interface`, `vlan` (1 to 4094), and optional `address` and `comment`. |
| `sdn_zones` | map(object) | `{}` | SDN zones by ID (up to 8 lowercase letters and digits), each with `type` (`simple`, the default, or `vlan`), `bridge` (for a vlan zone) and `mtu`. |
| `vnets` | map(object) | `{}` | VNets by ID (up to 8 lowercase letters and digits), each with `zone`, `tag` (the VLAN in a vlan zone), `alias`, and `subnets` by CIDR with optional `gateway` and `snat`. |

## Outputs

| Name | Description |
| --- | --- |
| `bridges` | Names of the bridges the circuit manages. |
| `vnets` | IDs of the VNets, which guests use as their bridge. |

## Requirements

Requires Conn3x v0.7.0 or later, and a Proxmox VE 9 node with the API reachable on port 8006 and `ifupdown2`, which Proxmox VE installs and runs by default. For SDN, `/etc/network/interfaces` must end with `source /etc/network/interfaces.d/*`, as it does after an ISO install; without it the VNets are created but never come up. Nodes installed on Debian, such as with circuit-proxmox on a cloud image, may need that line added by hand.

## The provider

This circuit pins [bpg/proxmox](https://github.com/bpg/terraform-provider-proxmox) at exactly 0.120.0. It's a community provider, not Proxmox's own, maintained by [bpg](https://github.com/bpg) (BPG Labs) and a busy group of contributors, with releases most weeks. A new provider release reaches this circuit only through a reviewed change that passes CI first.

The resource that applies SDN is marked experimental in the provider's docs. The API token stays in the provider block, which is never written to state; CI checks the state for it anyway.

## Tested on

Proxmox VE 9.2.26 (`pve-manager/9.2.26`, kernel 7.0.14-28-pve) on Debian 13, virtual, not hardware. CI boots a Debian 13 cloud image under KVM on a hosted Ubuntu 24.04 runner, turns it into a node with [circuit-proxmox](/circuits/proxmox) v0.1.1, makes an API token on it, and applies [examples/local](https://github.com/conn3xorg/circuit-proxmox-network/tree/v0.1.0/examples/local): a VLAN-aware bridge on the VM's second NIC, which goes nowhere (so the VM's own uplink is never touched), a VLAN 20 interface on it, a simple zone with a routed subnet and a vlan zone on the bridge.

The example is applied first with the provider's previous release, 0.119.0, then with the pinned 0.120.0, and the plan after that has no changes. Then network namespaces on the node stand in for guests, plugged in the way a guest's NIC is:

- One untagged on VLAN 20 of the bridge pings the node's VLAN 20 address. One on VLAN 30 can't.
- One on the `guest` VNet pings the one on VLAN 30 of the bridge, so the vlan zone tags its traffic with 30.
- One on the `lab50` VNet pings its gateway on the node.
- The API token isn't in the state file.
- A bridge comment changed by hand with `pvesh` shows up in `conn3x drift`, and the next apply puts it back with a clean plan after.
- After a reboot of the node, the same traffic checks pass and the plan is still clean.

Real NICs, bonds and switch trunks weren't tested; the bridge's port in CI is a virtual NIC with nothing on the other end. Neither were multi-node clusters, where SDN applies to every node.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-proxmox-network/blob/v0.1.0/LICENSE). Proxmox VE itself is AGPL-3.0.

## Source

- Repository: [conn3xorg/circuit-proxmox-network](https://github.com/conn3xorg/circuit-proxmox-network). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-proxmox-network/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-proxmox-network/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-proxmox-network/tree/v0.1.0/examples/local).
- Related circuits: [Proxmox VE](/circuits/proxmox), [RouterOS baseline](/circuits/routeros-baseline), [OPNsense VLANs](/circuits/opnsense-vlans).
