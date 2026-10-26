---
title: Handlers
description: The handler block, notify, when handlers run and on which hosts, and the revision attribute they watch.
---

A handler restarts or reloads a systemd service on the hosts where a step that notifies it changed something.

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

  step "config" {
    file {
      path    = "/etc/nginx/nginx.conf"
      content = "events {}\nhttp { server { listen 80; } }\n"
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

## Syntax

```text
handler "NAME" {
  service {
    name   = EXPRESSION
    action = "restart" | "reload"   # optional
  }
}
```

A handler block takes one label, the handler's name, and contains exactly one `service` block:

| Argument | Required | Description |
| --- | --- | --- |
| `name` | Yes | The systemd unit to act on, such as `"nginx"` or `"nginx.service"`. |
| `action` | No | `"restart"` or `"reload"`. Defaults to `"restart"`. |

A handler takes no other arguments or blocks.

## notify

A step names the handlers it notifies in `notify`, a list of `handler.NAME` references:

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "site" {
    file {
      path    = "/etc/nginx/conf.d/site.conf"
      content = "server { listen 80; }\n"
    }
    notify = [handler.reload, handler.restart_exporter]
  }

  step "tls" {
    file {
      path    = "/etc/nginx/conf.d/tls.conf"
      content = "ssl_protocols TLSv1.3;\n"
    }
    notify = [handler.reload]
  }

  handler "reload" {
    service {
      name   = "nginx"
      action = "reload"
    }
  }

  handler "restart_exporter" {
    service {
      name = "nginx-exporter"
    }
  }
}
```

- A step can notify several handlers, and several steps can notify the same handler.
- A handler can only be notified by steps in its own circuit. Naming a handler the circuit doesn't have is an error.
- A handler that no step notifies is a warning. It never runs, and Conn3x creates no resource for it.

## When handlers run

A handler runs on a host when, during this apply, a step that notifies it changed something on that host:

- It runs only on the hosts that changed. If a notifying step changed `web1` but not `web2`, the handler runs on `web1` only.
- It runs after every step in the circuit has finished on every host, not straight after the step that notified it.
- It runs at most once on each host in an apply, however many of its steps changed.
- Putting back a change someone made by hand counts. If someone edits a file and the apply writes it back, the handler runs, even though the file now matches the previous apply.
- For a step with `for_each`, it runs on a host when any of that host's items changed.

A handler also runs on a host the first time Conn3x applies it there: when the circuit is first applied, when a host is added to `hosts`, and when a handler that nothing notified before gets its first `notify`. Changing which steps notify a handler runs it on the next apply too.

A plan shows a handler that will run as a `conn3x_service_action` instance to be replaced. Changing only a handler's `name` or `action` updates the recorded settings and doesn't run it.

Handlers in the same circuit have no order among themselves. A handler doesn't run when you remove it, and removing a handler changes nothing on the host. Refresh doesn't read anything for a handler, so a handler never shows drift.

## How handlers are built

A handler `NAME` in circuit `CIRCUIT` becomes the resource `conn3x_service_action.CIRCUIT__NAME`, with one instance per host. Each instance:

- depends on the circuit's last step, so it runs after every step;
- has a `triggers` argument holding the `revision` of each notifying step's instance on the same host.

When a notifying step changes something on a host, its `revision` changes, so the handler's `triggers` on that host change and Conn3x replaces that instance. Creating the instance is what runs the action.

## The revision attribute

Every step's resource has a computed `revision` attribute, a random string that Conn3x replaces each time it changes something on the host for that instance. It stays the same when the step plans no change. In a plan, it shows as `(known after apply)` on instances that are about to change.

Handlers watch `revision`, and you can use it the same way. A `command` step's `triggers` argument runs the command again whenever its value changes, and a `reboot` step's `triggers` reboots the host:

```hcl
circuit "app" {
  hosts = {
    app1 = "10.0.1.5"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "config" {
    file {
      path    = "/etc/app/app.conf"
      content = "workers = 4\n"
    }
  }

  step "migrate" {
    command {
      command  = "/usr/local/bin/app migrate"
      triggers = { config = conn3x_file.app__config[each.key].revision }
    }
  }
}
```
