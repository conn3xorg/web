---
title: Steps
description: "The step block, the order steps run in, implicit and explicit dependencies, depends_on, for_each with item.key and item.value, instance keys for repeated steps, import for adopting what a host already has, and lifecycle: prevent_destroy, ignore_changes, create_before_destroy, replace_triggered_by and conditions."
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
  import     = true | [HOST, ...] # optional

  MODULE {
    ARGUMENT = EXPRESSION
    ...
  }

  lifecycle {                    # optional
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
| `import` | No | `true`, or a list of host names, to adopt the object already on those hosts instead of creating it. See [import](#import). |
| `lifecycle` | No | One block that protects the step from removal, ignores changes made elsewhere, or checks conditions. See [lifecycle](#lifecycle). |

A step accepts nothing else. The resource meta-arguments `count`, `provider`, `provisioner` and `connection` aren't available in a step.

## Modules

These are the module blocks a step can contain: `archive`, `authorized_key`, `block`, `command`, `cron`, `directory`, `download`, `file`, `firewalld`, `git`, `group`, `hostname`, `ini`, `known_hosts`, `limit`, `line`, `link`, `locale`, `mount`, `package`, `reboot`, `replace`, `repository`, `selinux_boolean`, `selinux_fcontext`, `service`, `sysctl`, `template`, `timer`, `timezone`, `ufw`, `user` and `wait_for`.

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

## import

:::note
`import` on a step is new on `main` and comes in the next release. v0.7.3 and earlier reject it with "Unsupported argument in step".
:::

`import` adopts what's already on a host into state, so Conn3x manages it from then on without creating it first:

```hcl
step "nginx" {
  import = true            # every host in the circuit
  package {
    name = "nginx"
  }
}

step "motd" {
  import = ["web1"]        # only web1; other hosts get a new file
  file {
    path    = "/etc/motd"
    content = "Managed by Conn3x\n"
  }
}
```

| Value | What it does |
| --- | --- |
| `true` | Adopts the step on every host. |
| A list of host names | Adopts it on those hosts only. In a step with `for_each`, a host name covers every item on that host, and an instance key such as `"web1/tree"` picks one. A name that isn't in `hosts` is an error. |
| `false` | The same as leaving `import` out. |

The first plan reads each host. Where the host already matches the step, the plan says `will be imported`. Where it doesn't, it says `will be updated in-place` and shows the diff, which apply then makes. Once a step is in state, its import does nothing, so it's safe to leave in.

An import says the object exists. When a listed host doesn't have it, the plan fails rather than creating it:

```text
Error: Nothing to import on box

The step imports file /etc/app.conf on box, but box doesn't have it, so
there's nothing to adopt. Remove box from the step's import, or set import to
the hosts that already have it; Conn3x then creates it on the rest.
```

These modules can import: `directory`, `file`, `group`, `link`, `package`, `service`, `template` and `user`. Any other module rejects `import`.

A few details:

- Each step lowers to an OpenTofu [`import` block](https://opentofu.org/docs/language/import/), so `import` works in the root configuration only, as in OpenTofu.
- The import ID is JSON with the step's arguments and ssh settings, and the plan prints it once in an `imported from` line. It names your key and known_hosts files by path; it never holds a key, and never a file's content.
- A write-only file (`content_wo`, or a template with `write_only = true`) is imported as an HMAC of what's on the host. The content stays out of state.
- A `service` step that sets `state` or `enabled` takes both from the host, so a stopped unit plans `state = "stopped" -> "started"`.
- To adopt exactly what's there and change nothing on the first apply, add `lifecycle { ignore_changes = all }`, then remove it.

[Adopt servers you already run](/guides/adopt-servers) walks through a whole server.

## lifecycle

:::note
`lifecycle` in a step is new on `main` and comes in the next release. v0.7.3 and earlier reject it with "Unsupported block in step".
:::

A step's `lifecycle` block works like [OpenTofu's](https://opentofu.org/docs/language/meta-arguments/lifecycle/), with the same arguments, checks and messages, because Conn3x hands it to OpenTofu's own decoder. It sits beside the module block:

```hcl
circuit "try" {
  hosts = { box = "127.0.0.1" }

  ssh {
    port             = 2222
    user             = "root"
    private_key_file = "./id_ed25519"
    known_hosts_file = "./known_hosts"
  }

  step "motd" {
    file {
      path    = "/etc/motd"
      content = "Hello from ${each.key}, set up by Conn3x.\n"
    }

    lifecycle {
      ignore_changes  = [content]
      prevent_destroy = true

      precondition {
        condition     = each.key != "db1"
        error_message = "The motd circuit doesn't run on database hosts, and ${each.key} is one."
      }
    }
  }
}
```

That's the [try-it-locally](/tutorials/try-locally) circuit with one step. Each example below ran against its container.

| Argument | What it does in a step |
| --- | --- |
| `prevent_destroy` | Fails any plan that would remove the step from a host. |
| `ignore_changes` | A list of the module's arguments, or `all`. Changes to them, on the host or in the config, don't show in the plan. |
| `create_before_destroy` | Adds the new object before removing the old one when the step is replaced. Only some modules take it; see [create_before_destroy](#create_before_destroy). |
| `replace_triggered_by` | A list of resource addresses. When one of them changes, the step is replaced. |
| `precondition` | A block with `condition` and `error_message`, checked before the step is planned. |
| `postcondition` | The same, checked against the planned and applied step, which is `self`. |

A step takes one `lifecycle` block. `enabled` and `destroy` aren't available in a step:

- For `enabled`, a step already repeats over its hosts, and OpenTofu doesn't allow `enabled` beside `for_each`. Filter `hosts` to run a step on fewer hosts, or give the step an empty `for_each` to run it nowhere.
- For `destroy`, the module's [`on_remove`](/reference/circuits/removal) already says what removal does. `on_remove = "forget"` leaves the object on the host.

### prevent_destroy

A bad variable that empties `hosts` would remove every step from every host. With `prevent_destroy = true`, the plan stops instead:

```text
$ conn3x plan
Error: Resource instance cannot be destroyed

  on main.circuit.hcl line 11, in circuit "try":
  11:   step "motd" {

Resource instance conn3x_file.try__motd["box"] has prevent_destroy set, but
the plan calls for it to be destroyed.
```

`on_remove = "forget"` doesn't make this unnecessary. Forget keeps the file on the host, but the step still leaves state, and the next apply no longer manages it. `prevent_destroy` stops that from happening by accident.

### ignore_changes

`ignore_changes` names the module's own arguments, such as `content`, `mode` or `shell`, as listed on each [module page](/modules/file). The `ssh` block can be ignored as a whole. With `ignore_changes = [content]` above, someone edits the file on the host and the plan leaves it alone:

```text
$ ssh -p 2222 -i id_ed25519 -o UserKnownHostsFile=known_hosts root@127.0.0.1 'echo "Back at 14:00. -- Sam" > /etc/motd'
$ conn3x plan
conn3x_file.try__motd["box"]: Refreshing state... [id=127.0.0.1:2222:/etc/motd]

No changes. Your infrastructure matches the configuration.
```

An ignored argument also stays as it is when another argument of the same step changes. A `user` step with `ignore_changes = [shell]` adds the user to a new group without resetting a shell someone changed by hand.

In a `template` step, name the template's arguments: `source` and `vars` mean the rendered `content`, and `destination` means `path`. Write-only arguments, such as `content_wo` and `validate`, can't be ignored.

A name the module doesn't have is an error when you validate:

```text
Error: Unsupported attribute

  on main.circuit.hcl line 18, in circuit "try":
  18:       ignore_changes = [colour]

This object has no argument, nested block, or exported attribute named
"colour".
```

### create_before_destroy

When a step's change replaces it, Conn3x removes the old object and then adds the new one. For a firewall rule, that closes the old port before the new rule is added. `create_before_destroy = true` turns the order around, so a key rotation adds the new key before the old one goes:

```hcl
step "deploy_key" {
  authorized_key {
    user = "deploy"
    key  = var.deploy_key
  }

  lifecycle {
    create_before_destroy = true
  }
}
```

It works on the modules whose replacement is always a different object on the host: `authorized_key`, `cron`, `firewalld`, `repository`, `timer`, `ufw`, `windows_firewall_rule`, `windows_iis_app_pool`, `windows_iis_site` and `windows_scheduled_task`. On any other module, a replacement can land on the same file, package or user, and removing the old one would delete what was just made, so Conn3x refuses it:

```text
Error: create_before_destroy isn't available on a file step

  on main.circuit.hcl line 18, in circuit "try":
  18:       create_before_destroy = true

Replacing a file step can land on the same object on the host, and the old
object's removal would then delete what was just created, so
create_before_destroy has nothing to keep. It works on steps whose
replacement is always a different object: authorized_key, cron, firewalld,
repository, timer, ufw, windows_firewall_rule, windows_iis_app_pool,
windows_iis_site, windows_scheduled_task.
```

`create_before_destroy = false` is accepted on every module. OpenTofu also turns `create_before_destroy` on for everything a step with it depends on, which includes every earlier step in the circuit, when one of those is replaced.

### replace_triggered_by

`replace_triggered_by` takes resource addresses, as `depends_on` does. To name a step, use its resource address, such as `conn3x_file.web__conf`; `step.conf` isn't valid. In a step without `for_each`, `[each.key]` picks the same host's instance. In a step with `for_each`, name whole resources only: OpenTofu allows only `each.key` there, and in that step it would be the `"HOST/ITEM"` key, so `each` and `item` are an error.

### precondition and postcondition

Conditions see the same names as the module block: `each.key` and `each.value` are the host, and in a step with `for_each`, `item.key` and `item.value` are the item. A postcondition can also read the step's attributes through `self`. A failed precondition stops the plan before anything runs on the host:

```text
$ conn3x plan
Error: Resource precondition failed

  on main.circuit.hcl line 22, in circuit "try":
  22:         condition     = each.key != "db1"
    ├────────────────
    │ each.key is "db1"

The motd circuit doesn't run on database hosts, and db1 is one.
```

A postcondition is checked against the plan when the values are known then, and again after apply:

```hcl
lifecycle {
  postcondition {
    condition     = self.mode == "0600"
    error_message = "/etc/motd on ${each.key} is ${self.mode}, not 0600."
  }
}
```

```text
$ conn3x plan
Error: Resource postcondition failed

  on main.circuit.hcl line 20, in circuit "try":
  20:         condition     = self.mode == "0600"
    ├────────────────
    │ self.mode is "0644"
    ├────────────────
    │ Diff:
    │     "0644" -> "0600"

/etc/motd on box is 0644, not 0600.
```

## Warnings

Conn3x warns when one step writes a whole file with `file` or `template` and another step in the same circuit edits the same file with `line` or `block`. Each apply would undo the other. Put the edit in the file's content instead.
