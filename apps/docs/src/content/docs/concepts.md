---
title: Concepts
description: Circuits, steps, handlers, plans, state and drift, and how they fit together.
---

Conn3x is built on OpenTofu, so if you know Terraform you know most of it already: you write configuration, `plan` shows the changes, `apply` makes them, and a state file remembers what Conn3x manages. Circuits extend that from cloud resources to what runs on the servers.

## Circuits and steps

A **circuit** configures a group of hosts. It names them in `hosts`, says how to reach them in an `ssh` block, and lists **steps**. Each step uses one **module** (a package, a file, a service, a firewall rule), and the steps run in the order written.

```hcl
circuit "web" {
  hosts = { web1 = "203.0.113.10", web2 = "203.0.113.11" }
  ssh { user = "deploy", become = true }

  step "nginx" {
    package { name = "nginx" }
  }
}
```

Circuits live in `.circuit.hcl` files, or in ordinary `.tf` files beside your resources. Every value can be any Terraform expression: a variable, a local, or an attribute of a resource created in the same plan.

## One plan, two layers

Each step becomes a resource, one instance per host. `step "nginx"` in circuit `web` is `conn3x_package.web__nginx["web1"]`, and so on for every host. That's why one plan can hold both a cloud server and the packages that go on it, ordered correctly: a circuit whose `hosts` refers to a droplet's address waits for the droplet.

## Reading before changing

At plan time Conn3x connects to every host and reads the current state of each step: the file's content, the package's version, whether the service runs. The plan then shows the difference. A file shows a line-by-line diff. When the host already matches, the step plans no change.

That read happens on every plan, which is how Conn3x notices **drift**: a file someone edited, a service someone stopped. `conn3x plan` shows the fix; `conn3x drift` just reports it.

## Handlers

A **handler** restarts or reloads a service, and runs only when a step that notifies it changed something:

```hcl
step "config" {
  file {
    path    = "/etc/nginx/nginx.conf"
    content = file("${path.module}/nginx.conf")
  }
  notify = [handler.reload]
}

handler "reload" {
  service {
    name   = "nginx"
    action = "reload"
  }
}
```

## What happens on removal

When you delete a step, Conn3x stops managing it. What happens on the host depends on the module, and most let you choose with `on_remove`:

- `"forget"` leaves things as they are. It's the default for files, packages, users and most settings, so deleting a line of configuration can't take a server down.
- `"delete"` removes what the step made. It's the default where leaving things behind would be a security risk: SSH keys, firewall rules, cron jobs and timers. A rotated key or a changed port shouldn't leave the old one active.

## Connecting

Conn3x uses SSH and nothing else. There's no agent, and nothing to install on the servers first. It always checks host keys, against `~/.ssh/known_hosts` or a key you pin with `host_key`, and it reuses one connection per host for the whole run. With `become = true` commands run through `sudo`; a password, if sudo needs one, comes from `become_password_file` and never reaches configuration or state.

## State

Cloud resources and host steps share one state file, so `conn3x plan` sees both layers at once. OpenTofu's state encryption works as it does there.
