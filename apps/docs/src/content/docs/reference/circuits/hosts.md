---
title: Hosts
description: The hosts argument of a circuit, the forms it accepts, host objects and their fields, and how instance keys are formed.
---

The `hosts` argument says which hosts a circuit configures. It is required.

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
    web2 = "203.0.113.11"
  }

  ssh {
    user = "deploy"
  }
}
```

Conn3x uses `hosts` as the `for_each` of every resource the circuit creates, so it follows OpenTofu's rules for [`for_each`](https://opentofu.org/docs/language/meta-arguments/for_each/): it must be a map or a set of strings, and its keys must be known when Conn3x plans. Its values can be unknown until apply, such as the address of a server created in the same plan.

## Accepted forms

### A map of names to addresses

Each key is the host's name, and each value is the address Conn3x connects to: a hostname or an IP address.

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
    web2 = "web2.example.com"
  }

  ssh {
    user = "deploy"
  }
}
```

### A map of names to host objects

A value can be an object with an `address` and any of the connection settings listed in [Host object fields](#host-object-fields). These override the circuit's `ssh` block for that host. A map can mix addresses and objects.

```hcl
circuit "fleet" {
  hosts = {
    web1 = "10.0.0.4"
    db1  = { address = "10.0.0.5", user = "admin", port = 2222 }
  }

  ssh {
    user = "deploy"
  }
}
```

### A set of addresses

A set of strings uses each address as the host's name too. Wrap a list in `toset()`: a list or tuple is an error.

```hcl
circuit "web" {
  hosts = toset(["203.0.113.10", "203.0.113.11"])

  ssh {
    user = "deploy"
  }
}
```

### An expression

Any expression that produces one of these forms works: a variable, a local, a `for` expression over a resource, or a `merge()` of several maps. An inventory is an ordinary variable, and a group is a map you merge with another.

```hcl
variable "web_hosts" {
  type = map(string)
}

variable "db_hosts" {
  type = map(string)
}

circuit "monitoring" {
  hosts = merge(var.web_hosts, var.db_hosts)

  ssh {
    user = "deploy"
  }
}
```

To configure servers created in the same plan, build the map from the resource. The circuit's steps then wait for the servers:

```hcl
variable "app_addresses" {
  type = map(string)
}

resource "terraform_data" "app" {
  for_each = var.app_addresses
  input    = each.value
}

circuit "app" {
  hosts = { for name, server in terraform_data.app : name => server.output }

  ssh {
    user = "root"
  }
}
```

For a complete example with DigitalOcean droplets and host keys pinned at creation, see [Provision and configure](/guides/provision-and-configure).

## Host object fields

| Field | Type | Description |
| --- | --- | --- |
| `address` | string | Required. The hostname or IP address to connect to. |
| `user` | string | Overrides the `ssh` block's `user`. |
| `port` | number | Overrides the `ssh` block's `port`. |
| `private_key_file` | string | Overrides the `ssh` block's `private_key_file`. |
| `host_key` | string | Overrides the `ssh` block's `host_key`. Use it to pin each host's own key. |
| `jump_hosts` | list of strings | Overrides the `ssh` block's `jump_hosts`. An empty list connects to this host directly. |

Only these five settings can be overridden per host. The others, such as `become`, `known_hosts_file` and `timeout`, come from the `ssh` block for every host.

Any other field is an error. Without that check, `become = true` in a host object would pass and do nothing, and you'd find out on the server. `validate` reports it when `hosts` is known, and `plan` reports it otherwise:

```text
Error: Unsupported field in host object

Host "web1" sets "become", which a host object doesn't take. A host object
takes address, user, port, private_key_file, host_key and jump_hosts. Other
ssh settings, such as become, go in the circuit's ssh block.
```

Per-host data that isn't a connection setting, such as a role, goes in a map of its own, keyed by host name. Steps look it up with `each.key`:

```hcl
locals {
  roles = {
    app1 = "primary"
    app2 = "replica"
  }
}

circuit "app" {
  hosts = {
    app1 = "10.0.1.5"
    app2 = "10.0.1.6"
  }

  ssh {
    user = "deploy"
  }

  step "role" {
    file {
      path    = "/etc/app/role"
      content = "${local.roles[each.key]}\n"
    }
  }
}
```

See [The ssh block](/reference/circuits/ssh#precedence) for how host objects, the `ssh` block and an SSH config file combine.

## each.key and each.value

Inside a step's module block, `each.key` is the host's name and `each.value` is its entry in `hosts`: the address string, or the host object. With a set of addresses, both are the address.

The same holds in a step with its own `for_each`. There, `item.key` and `item.value` are the item, and `each` is still the host. See [Steps](/reference/circuits/steps#for_each).

## Instance keys

Every resource a circuit creates has one instance per host, keyed by the host's key in `hosts`:

| `hosts` | Instance keys |
| --- | --- |
| `{ web1 = "203.0.113.10" }` | `["web1"]` |
| `{ db1 = { address = "10.0.0.5" } }` | `["db1"]` |
| `toset(["203.0.113.10"])` | `["203.0.113.10"]` |

A step with `for_each` has one instance per host and item, keyed `"HOST/ITEM"`, such as `["web1/git"]`.

The key is the host's identity in state, so choose names that won't change.

## Adding, removing and renaming hosts

- Add a host to `hosts`, and the next plan creates every step on it, and runs every notified handler on it.
- Remove a host, and the next plan destroys that host's instances of every step. What happens on the host depends on each step's [`on_remove`](/reference/circuits/removal).
- Rename a host's key, and Conn3x sees one host removed and another added. To keep the existing instances under the new name, use a `moved` block or `conn3x state mv`. See [Resource addresses](/reference/circuits/addresses#renaming).
