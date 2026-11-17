---
title: Take hosts from NetBox
description: Build a circuit's hosts from the virtual machines or devices NetBox lists, by tag or role, so NetBox stays the one place they're recorded.
---

If NetBox is where your team records what exists, a second list of hosts in a circuit is one more thing to keep in step, and it won't be. Read them from NetBox instead. The [NetBox provider](https://search.opentofu.org/provider/e-breuninger/netbox/latest) looks them up when you plan, by tag, role or any other filter NetBox's API takes, and a `for` expression turns them into the circuit's `hosts`. Tag a VM `web` in NetBox, run `conn3x apply`, and it's configured with the rest.

The recipes below were run against NetBox 4.7.5 in [netbox-docker](https://github.com/netbox-community/netbox-docker), with version 6.0.1 of the provider. The provider warned "Possibly unsupported Netbox version" for 4.7.5, and everything still worked.

## Connect to NetBox

```hcl
terraform {
  required_providers {
    netbox = { source = "e-breuninger/netbox" }
  }
}

provider "netbox" {
  server_url = "https://netbox.example.com" # the token comes from NETBOX_API_TOKEN
}
```

The provider takes both kinds of NetBox token: a v1 token, and a v2 token in its `nbt_<key>.<token>` form, which is what the test used.

## Virtual machines by tag

`netbox_virtual_machines` lists the machines that match its filters. It gives each one's primary IPv4 address only as an ID, so `netbox_ip_address` reads the address:

```hcl
data "netbox_virtual_machines" "web" {
  filters = [
    { name = "tag", value = "web" },
    { name = "status", value = "active" },
  ]
}

data "netbox_ip_address" "web" {
  for_each = { for vm in data.netbox_virtual_machines.web.virtual_machines : vm.name => vm.primary_ip4_id if vm.primary_ip4_id != null }
  id       = each.value
}

locals {
  web_hosts = { for name, ip in data.netbox_ip_address.web : name => split("/", ip.ip_address)[0] }
}

circuit "web" {
  hosts = local.web_hosts

  ssh {
    user   = "deploy"
    become = true
  }

  step "motd" {
    file {
      path    = "/etc/motd"
      content = "${each.key} came from NetBox.\n"
    }
  }
}
```

NetBox records an address with its prefix length, such as `10.0.1.5/24`, so `split` keeps what's before the slash. A machine with no primary IPv4 address is left out, rather than failing the plan. Each `name` in a filter is a parameter of NetBox's API list, so `role`, `site`, `cluster` and `tenant` work the same way as `tag`.

## Devices by role

Devices work the same way, with `netbox_devices`:

```hcl
data "netbox_devices" "switches" {
  filters = [
    { name = "role", value = "switch" },
    { name = "status", value = "active" },
  ]
}

data "netbox_ip_address" "switches" {
  for_each = { for d in data.netbox_devices.switches.devices : d.name => d.primary_ip4_id if d.primary_ip4_id != null }
  id       = each.value
}

locals {
  switch_hosts = { for name, ip in data.netbox_ip_address.switches : name => split("/", ip.ip_address)[0] }
}
```

`local.switch_hosts` then goes into a circuit for the switches, such as one with the [Arista EOS steps](/network-devices). The lookup above was tested; the EOS steps against these switches weren't, since the test had no real switch.

## When NetBox changes

The data sources are read on every plan. A machine that gains the tag, or gets a primary address, is added, and its steps are created. One that loses either drops out of `hosts`, and its steps are removed from state. In the test, taking app1's primary address away removed its `motd` step on the next apply. Conn3x doesn't log in to undo a removed step unless the step sets `on_remove`. If an apply should never shrink the fleet by surprise, check the plan for steps it removes before you apply.

Host keys are checked as for any host, so a machine Conn3x hasn't met stops the plan until its key is known. See [Find hosts by cloud tag](/guides/hosts-from-cloud-tags/#host-keys) for the ways to record it.
