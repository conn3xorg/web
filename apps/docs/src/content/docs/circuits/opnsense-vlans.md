---
title: OPNsense VLANs
description: "Builds trusted, IoT and guest VLANs on OPNsense, with Kea DHCP, firewall rules and local names in Unbound."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-opnsense-vlans at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/opnsense-vlans/grade.svg)](https://conn3x.org/circuits/opnsense-vlans/grade)

A Conn3x circuit for the usual home and small-office split on an OPNsense firewall: a trusted VLAN, an IoT VLAN and a guest VLAN, each with Kea DHCP and its own firewall rules, plus the local names Unbound answers for. The IoT and guest networks get DNS and the internet, and nothing private, the firewall's own GUI included.

It works through the OPNsense API with the [browningluke/opnsense](https://registry.opentofu.org/providers/browningluke/opnsense) provider.

## Usage

```hcl
terraform {
  required_providers {
    opnsense = {
      source = "browningluke/opnsense"
    }
  }
}

variable "api_key" {
  type      = string
  ephemeral = true
  sensitive = true
}

variable "api_secret" {
  type      = string
  ephemeral = true
  sensitive = true
}

provider "opnsense" {
  uri        = "https://192.168.1.1"
  api_key    = var.api_key
  api_secret = var.api_secret
}

module "vlans" {
  source = "github.com/conn3xorg/circuit-opnsense-vlans?ref=v0.1.0"

  vlans = {
    trusted = {
      parent    = "igc1"
      tag       = 10
      address   = "10.10.0.1/24"
      interface = "opt1"
      dhcp      = { pools = ["10.10.0.100-10.10.0.199"] }
    }
    iot = {
      parent    = "igc1"
      tag       = 20
      address   = "10.20.0.1/24"
      interface = "opt2"
      policy    = "internet_only"
      dhcp      = { pools = ["10.20.0.100-10.20.0.199"] }
    }
    guest = {
      parent    = "igc1"
      tag       = 30
      address   = "10.30.0.1/24"
      interface = "opt3"
      policy    = "internet_only"
      dhcp      = { pools = ["10.30.0.100-10.30.0.199"] }
    }
  }

  host_overrides = {
    "nas.home.arpa" = "10.10.0.10"
  }
}
```

Make an API key under **System > Access > Users**, set `TF_VAR_api_key` and `TF_VAR_api_secret`, and run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`, and `conn3x drift` tells you when a rule, VLAN, subnet or override has been changed in the GUI since.

### Two applies, with the GUI in between

The OPNsense API can create a VLAN, but the provider can't yet assign one to an interface or give that interface an address, so one step stays in the GUI. Leave out `interface` the first time:

1. Apply. The VLANs exist as devices, `vlan0.10`, `vlan0.20` and `vlan0.30` (the `vlan_devices` output lists them).
2. In **Interfaces > Assignments**, add each device. OPNsense calls them `opt1`, `opt2` and so on. On each one's own page, tick **Enable**, set **IPv4 Configuration Type** to Static and give it the address you put in `address`.
3. In **Services > Kea DHCP > Kea DHCPv4 > Settings**, tick **Enabled** and pick those interfaces. The provider has nothing for these settings either. A fresh OPNsense 26.7 hands out addresses with Dnsmasq instead, which holds the DHCP port, so turn its DHCP off under **Services > Dnsmasq DNS & DHCP** first, or Kea never starts.
4. Set `interface` on each VLAN and apply again. The rules and DHCP subnets appear.

After that it's one apply per change. Adding a VLAN later means the same four steps for that one.

## What it does

1. Creates each VLAN on its parent interface, as device `vlan0.<tag>` unless you set `device`.
2. For each VLAN with `interface` set, adds firewall rules on that interface, by `policy`:
   - `trusted` (the default): anything from the VLAN's network.
   - `internet_only`: DNS (TCP and UDP 53) to the firewall's address on the VLAN, then a block on everything in `private_networks`, then anything else. That alias holds RFC 1918, CGNAT and link-local ranges by default, so the firewall's other addresses are blocked too.
3. For each VLAN with `interface` and `dhcp` set, adds a Kea DHCPv4 subnet for the VLAN's network with your pools, the firewall's address as router and DNS server, and an optional domain name.
4. Adds an Unbound host override for each name in `host_overrides`.

The rules start at sequence 10000 (`rule_sequence`), ten apart per VLAN in name order, so they stay clear of rules you add by hand lower down.

It doesn't do NAT, WAN settings, outbound rules, VPNs, or DHCP reservations. The provider has resources for several of those (WireGuard, IPsec, port forwards, Kea reservations), and they sit fine next to this circuit.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `vlans` | map(object) | `{}` | VLANs by name, each with `parent` (such as `"igc1"`), `tag` (1 to 4094), `address` (the firewall's address on the VLAN, such as `"10.20.0.1/24"`), and optional `device`, `interface` (such as `"opt2"`, once assigned), `policy` (`trusted` or `internet_only`), `description` and `dhcp` (`pools`, and an optional `domain_name`). |
| `host_overrides` | map(string) | `{}` | Names Unbound answers with your own address, as full name to IPv4 address, such as `{ "nas.home.arpa" = "10.10.0.10" }`. |
| `private_networks` | list(string) | RFC 1918, `100.64.0.0/10`, `169.254.0.0/16` | Networks an `internet_only` VLAN can't reach. |
| `rule_sequence` | number | `10000` | Sequence number the circuit's rules start from. |

## Outputs

| Name | Description |
| --- | --- |
| `vlan_devices` | The device for each VLAN, by VLAN name, such as `{ iot = "vlan0.20" }`. |
| `unassigned` | VLANs with no `interface` yet, which have no rules or DHCP. |

## Requirements

Requires Conn3x v0.7.0 or later and OPNsense 26.7 with an API key for a user that can manage interfaces, firewall rules, Kea and Unbound. The key and secret stay in the provider block as ephemeral values, never in state.

## The provider

This circuit pins [browningluke/opnsense](https://github.com/browningluke/terraform-provider-opnsense) at exactly 0.26.0. It's a community provider, not Deciso's, maintained mainly by Luke Browning ([browningluke](https://github.com/browningluke)); its last release was 31 July 2026. Its own README says it isn't recommended for production yet, and it only covers what OPNsense's API exposes, which is why interface assignment stays in the GUI. A new provider release reaches this circuit only through a reviewed change that passes CI first.

## Tested on

OPNsense 26.7 (the nano image), virtual, not hardware. CI downloads the image from `pkg.opnsense.org`, checks it against the SHA-256 in OPNsense's checksum file, builds it into a local image with [vrnetlab](https://github.com/srl-labs/vrnetlab) at a pinned commit, and boots it under KVM in [containerlab](https://containerlab.dev) on a hosted Ubuntu 24.04 runner, with an Alpine container on its `vtnet2`. The image is never pushed or uploaded anywhere. [examples/local](https://github.com/conn3xorg/circuit-opnsense-vlans/tree/v0.1.0/examples/local) is the same lab, and its `assign.sh` does the GUI steps above by script.

In CI the example is applied first with the provider's previous release, 0.25.0, then with the pinned 0.26.0, with a clean plan after. Then the VLANs are assigned, the second apply adds the rules and DHCP, and the plan after that is clean too. Then, from the client container, on each of the three VLANs, tagged:

- It gets a DHCP lease from Kea's pool.
- The firewall's resolver answers `nas.home.arpa` with the override.
- The trusted VLAN reaches the firewall's GUI; the IoT and guest VLANs don't.

The API secret isn't in the state file. A rule description changed by hand through the API shows up in `conn3x drift`, and the next apply puts it back with a clean plan after. After a reboot of the firewall, the same checks pass and the plan is still clean.

Real NICs and switches weren't tested; neither was traffic out to the internet, since the lab's WAN isn't connected.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-opnsense-vlans/blob/v0.1.0/LICENSE). OPNsense is BSD-2-Clause.

## Source

- Repository: [conn3xorg/circuit-opnsense-vlans](https://github.com/conn3xorg/circuit-opnsense-vlans). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-opnsense-vlans/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-opnsense-vlans/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-opnsense-vlans/tree/v0.1.0/examples/local).
- Related circuits: [RouterOS baseline](/circuits/routeros-baseline), [Proxmox VE network](/circuits/proxmox-network).
