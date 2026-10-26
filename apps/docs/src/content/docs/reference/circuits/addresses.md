---
title: Resource addresses
description: The address of every step and handler instance, and how to use it with -target, the state commands, moved and removed blocks, and references.
---

Every step and handler is a resource, so it has a resource address like any other. Use the address to target a step or a host in a plan, to inspect and change state, and to read a step's attributes.

## Address format

| Object | Address |
| --- | --- |
| A step, on every host | `conn3x_MODULE.CIRCUIT__STEP` |
| A step, on one host | `conn3x_MODULE.CIRCUIT__STEP["HOST"]` |
| A step with `for_each`, one host and item | `conn3x_MODULE.CIRCUIT__STEP["HOST/ITEM"]` |
| A handler, on every host | `conn3x_service_action.CIRCUIT__HANDLER` |
| A handler, on one host | `conn3x_service_action.CIRCUIT__HANDLER["HOST"]` |

`MODULE` is the step's module block, except that a `template` step is `conn3x_file` and a `ufw` step is `conn3x_ufw_rule`. `HOST` is the host's key in [`hosts`](/reference/circuits/hosts#instance-keys).

A circuit in a child module has the module's address in front, as in `module.edge.conn3x_file.web__motd["e1"]`.

For this circuit:

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
    web2 = "203.0.113.11"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "tools" {
    for_each = ["git", "jq"]
    package {
      name = item.value
    }
  }

  step "page" {
    file {
      path    = "/var/www/html/index.html"
      content = "<h1>${each.key}</h1>\n"
    }
    notify = [handler.reload]
  }

  handler "reload" {
    service {
      name   = "nginx"
      action = "reload"
    }
  }
}
```

the addresses are:

```text
conn3x_package.web__tools["web1/git"]
conn3x_package.web__tools["web1/jq"]
conn3x_package.web__tools["web2/git"]
conn3x_package.web__tools["web2/jq"]
conn3x_file.web__page["web1"]
conn3x_file.web__page["web2"]
conn3x_service_action.web__reload["web1"]
conn3x_service_action.web__reload["web2"]
```

`conn3x state list` prints the addresses of everything in state. There is no address for a whole circuit. To act on a circuit, name each of its steps, or put the circuit in a module and use the module's address.

## Quoting

Instance addresses contain quotes and brackets, so put them in single quotes in a POSIX shell:

```sh
conn3x state show 'conn3x_file.web__page["web1"]'
```

## Targeting with -target

`plan`, `apply` and `destroy` take `-target=ADDRESS` to limit the run to some resources. OpenTofu recommends `-target` only for exceptional cases, such as recovering from a mistake. See OpenTofu's [resource targeting](https://opentofu.org/docs/cli/commands/plan/).

Target a step on every host:

```sh
conn3x plan -target=conn3x_file.web__page
```

Target a step on one host:

```sh
conn3x plan -target='conn3x_file.web__page["web1"]'
```

Give `-target` more than once to target several addresses.

A target includes everything it depends on. Every step depends on the whole step before it, so targeting a step also includes every earlier step in the circuit, on every host. Targeting `conn3x_file.web__page["web1"]` above plans:

```text
conn3x_package.web__tools["web1/git"]
conn3x_package.web__tools["web1/jq"]
conn3x_package.web__tools["web2/git"]
conn3x_package.web__tools["web2/jq"]
conn3x_file.web__page["web1"]
```

The earlier steps run on `web2` too, and only the targeted step is limited to `web1`. Targeting a handler includes every step in its circuit. To check that the earlier steps have nothing to do, read the plan before you apply it.

## State commands

The [`conn3x state`](/reference/cli/state) commands take the same addresses:

| Command | Use |
| --- | --- |
| `conn3x state list conn3x_file.web__page` | List a step's instances. |
| `conn3x state show 'conn3x_file.web__page["web1"]'` | Show what Conn3x recorded for one host, including the `ssh` settings. |
| `conn3x state mv SOURCE DESTINATION` | Give a step, or one host's instance, a new address. |
| `conn3x state rm ADDRESS` | Stop managing a step or an instance, leaving the host as it is. |

None of these commands connects to a host or changes anything on it.

## Renaming

Renaming a step, a circuit or a host changes the addresses of its instances. Without telling Conn3x, the next plan destroys the old instances, which applies their [`on_remove`](/reference/circuits/removal), and creates new ones.

To keep the existing instances, add a `moved` block, or run `conn3x state mv` before the next plan. With a `moved` block, the change is part of the configuration and reviewed in the plan:

```hcl
moved {
  from = conn3x_file.web__page
  to   = conn3x_file.web__index
}
```

To rename a host, move each step's instance for that host:

```hcl
moved {
  from = conn3x_file.web__index["web1"]
  to   = conn3x_file.web__index["web-1"]
}
```

The plan shows each instance as moved, with no changes on the host. A move must keep the resource type, so you can't change a step's module with `moved`. See OpenTofu's [refactoring](https://opentofu.org/docs/language/modules/develop/refactoring/) for the rules of `moved` blocks.

## Removing from state

A `removed` block stops managing a step without destroying it, so nothing changes on the host whatever its `on_remove` says:

```hcl
removed {
  from = conn3x_file.web__index

  lifecycle {
    destroy = false
  }
}
```

`conn3x state rm` does the same from the command line. If the step is still in the circuit, the next plan creates it again.

## References

Other steps, resources and outputs can read a step's attributes by address. Inside the same circuit, use `[each.key]` for the current host:

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
  }

  ssh {
    user = "deploy"
  }

  step "page" {
    file {
      path    = "/var/www/html/index.html"
      content = "<h1>${each.key}</h1>\n"
    }
  }

  step "page_sum" {
    file {
      path    = "/var/www/html/index.sha256"
      content = "${conn3x_file.web__page[each.key].sha256}\n"
    }
  }
}

output "page_checksums" {
  value = { for host, f in conn3x_file.web__page : host => f.sha256 }
}
```

A reference makes the referring step depend on the step it reads, as described in [Steps](/reference/circuits/steps#implicit-dependencies).
