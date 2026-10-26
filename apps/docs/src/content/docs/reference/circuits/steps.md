---
title: Steps
description: The step block, the order steps run in, implicit and explicit dependencies, depends_on, for_each with item.key and item.value, and instance keys for repeated steps.
---

A step applies one module, such as a package, a file or a service, to every host in the circuit.

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "nginx" {
    package {
      name = "nginx"
    }
  }
}
```

## Syntax

```text
step "NAME" {
  for_each   = EXPRESSION        # optional
  depends_on = [ADDRESS, ...]    # optional
  notify     = [handler.NAME, ...] # optional

  MODULE {
    ARGUMENT = EXPRESSION
    ...
  }
}
```

A step block takes one label, the step's name, and contains:

| Name | Required | Description |
| --- | --- | --- |
| Module block | Yes | Exactly one module block, such as `package`, `file` or `service`. The [module reference](/modules/file) lists every module and its arguments. |
| `for_each` | No | Repeat the step for each item of a map, or of a list or set of strings, on every host. See [for_each](#for_each). |
| `depends_on` | No | A list of resources the step waits for, in addition to the step before it. See [depends_on](#depends_on). |
| `notify` | No | A list of handlers in the same circuit to run when this step changes something on a host. See [Handlers](/reference/circuits/handlers). |

A step accepts nothing else. The resource meta-arguments `count`, `lifecycle`, `provider`, `provisioner` and `connection` aren't available in a step.

## Modules

These are the module blocks a step can contain: `archive`, `authorized_key`, `block`, `command`, `cron`, `directory`, `download`, `file`, `firewalld`, `git`, `group`, `hostname`, `line`, `link`, `locale`, `mount`, `package`, `reboot`, `repository`, `selinux_boolean`, `selinux_fcontext`, `service`, `sysctl`, `template`, `timer`, `timezone`, `ufw`, `user` and `wait_for`.

Each has its own page under [Modules](/modules/file), with its arguments and the attributes Conn3x computes.

## Order

Steps run in the order they are written. Each step depends on the whole step before it, so a step starts on a host only after the step before it has finished on every host.

Within one step, Conn3x works on several hosts at once, up to the `-parallelism` limit of `plan` and `apply`, which defaults to 10.

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

  # Runs first, on both hosts.
  step "nginx" {
    package {
      name = "nginx"
    }
  }

  # Starts once nginx is installed on web1 and web2.
  step "running" {
    service {
      name    = "nginx"
      state   = "started"
      enabled = true
    }
  }
}
```

There is no order between circuits. Two circuits in the same configuration run independently unless one refers to the other or uses `depends_on`.

## Dependencies

### Implicit dependencies

A step depends on every resource its arguments refer to, the same way a resource does in OpenTofu. A step that reads another step's attributes waits for that step. A step that uses a cloud resource's attribute waits for that resource.

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "motd" {
    file {
      path    = "/etc/motd"
      content = "Hello from ${each.key}\n"
    }
  }

  step "checksum" {
    file {
      path    = "/etc/motd.sha256"
      content = "${conn3x_file.web__motd[each.key].sha256}\n"
    }
  }
}
```

To read a step's attributes, use its resource address with the host's key, usually `[each.key]`. See [Resource addresses](/reference/circuits/addresses). Each module's page lists the attributes it computes. Every step also has `id` and [`revision`](/reference/circuits/handlers#the-revision-attribute).

The expression in `hosts` is a dependency of every step in the circuit. A circuit whose `hosts` refers to a server's address waits for that server.

### depends_on

`depends_on` adds dependencies that no argument expresses. It takes a list of resource or module addresses, as in [OpenTofu](https://opentofu.org/docs/language/meta-arguments/depends_on/). To depend on a step, use its resource address, `conn3x_MODULE.CIRCUIT__NAME`. A reference such as `step.name` is not valid.

```hcl
circuit "db" {
  hosts = {
    db1 = "10.0.0.5"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "postgres" {
    package {
      name = "postgresql-server"
    }
  }
}

circuit "app" {
  hosts = {
    app1 = "10.0.1.5"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  # Waits until PostgreSQL is installed on every db host.
  step "app" {
    package {
      name = "app"
    }
    depends_on = [conn3x_package.db__postgres]
  }
}
```

A step's dependencies apply to the whole step, on every host. A step can't wait for one host's instance of another step only.

## for_each

`for_each` repeats a step for each item, on every host. It takes:

- A map or object. Each key is an item key.
- A list, tuple or set of strings. Each string is both the item's key and its value.

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
    for_each = ["git", "jq", "tree"]
    package {
      name = item.value
    }
  }

  step "sites" {
    for_each = { api = 8080, admin = 8081 }
    file {
      path    = "/etc/nginx/conf.d/${item.key}.conf"
      content = "server { listen ${item.value}; server_name ${item.key}.${each.key}; }\n"
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

The value is an error if it is null, if a list or set holds anything other than strings, or if a list holds the same string twice. Use a map for items that aren't strings.

### item and each

Inside a step with `for_each`:

| Expression | Value |
| --- | --- |
| `item.key` | The item's key: the map key, or the string. |
| `item.value` | The item's value: the map value, or the string. |
| `each.key` | The host's name, as in any step. The circuit's `ssh` block sees the same value. |
| `each.value` | The host's entry in `hosts`, as in any step. The circuit's `ssh` block sees the same value. |

`item` is only available in a step with `for_each`. Using it in another step is an error. `item.key` and `item.value` are the only attributes of `item`.

The `for_each` expression itself can't use `each`, so every host gets the same items. Choose a different set of items per host by putting them in separate circuits, or by making the step's arguments depend on `each`.

Inside a step with `for_each`, a `for` expression can't name its variables `each` or `item`.

### Instance keys

A step with `for_each` has one instance per host and item. Each instance is keyed `"HOST/ITEM"`:

```text
conn3x_package.web__tools["web1/git"]
conn3x_package.web__tools["web1/jq"]
conn3x_package.web__tools["web1/tree"]
conn3x_package.web__tools["web2/git"]
conn3x_package.web__tools["web2/jq"]
conn3x_package.web__tools["web2/tree"]
```

Remove an item from `for_each`, and the next plan destroys that item's instances on every host and leaves the other items alone. What happens on the host depends on the module's [`on_remove`](/reference/circuits/removal).

A handler notified by a step with `for_each` runs on a host when any of that host's items changed.

## Warnings

Conn3x warns when one step writes a whole file with `file` or `template` and another step in the same circuit edits the same file with `line` or `block`. Each apply would undo the other. Put the edit in the file's content instead.
