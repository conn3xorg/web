---
title: Revision and handlers
description: How Conn3x plans and assigns each step's revision, the resource a handler becomes, and how a hand edit on a host makes a handler run.
---

A handler has to run when a step changed something on a host, and only then. OpenTofu has no notion of "this resource changed during the apply", so Conn3x builds one out of plain attributes: every step records a `revision`, and every handler watches the revisions of the steps that notify it. This page describes both halves. For the language, see [Handlers](/reference/circuits/handlers).

## The revision attribute

Every host step's resource has a computed `revision` attribute. It's a random string of 16 hexadecimal characters. Conn3x gives an instance a new one each time an apply changes something on the host for it, and keeps the old one otherwise.

### How a plan sets it

When Conn3x plans a step instance, it decides the revision like this:

1. A new instance, with nothing in state, gets an unknown revision. The plan shows `revision = (known after apply)`.
2. An existing instance is compared with its state. Conn3x takes the planned object, copies in the stored values of the settings that change nothing on the host, and checks whether the result equals the stored object.
   - If it does, the plan keeps the stored revision.
   - If it doesn't, the plan sets the revision to unknown.

The settings that change nothing on the host, and so are left out of the comparison, are:

- `on_remove`;
- the `timeout` of a `reboot` or `wait_for` step;
- the `ssh` settings that change only how Conn3x logs in: everything except the host's address, `port` and `ssh_config_file`.

The comparison covers every other attribute, computed ones included. A `file` step whose `content` changed plans a new `sha256`, so its revision becomes unknown.

### How an apply sets it

When an apply finishes an instance whose planned revision was unknown, it sets a fresh random revision. An instance planned with a known revision keeps it. So the revision changes exactly when the plan said something on the host would change, and the apply made the change.

## The resource a handler becomes

A handler `NAME` in circuit `CIRCUIT` becomes the resource `conn3x_service_action.CIRCUIT__NAME`, with:

- the handler's `service` arguments, `name` and `action`;
- a `for_each` over the circuit's `hosts`, so there is one instance per host;
- an `ssh` block built the same way as a step's;
- a dependency on the circuit's last step;
- a `triggers` argument, built from the steps that notify it.

`triggers` is a list with one entry for each notifying step, holding that step's revision on the same host. For a step `config` in circuit `web`, the entry is:

```text
conn3x_file.web__config[each.key].revision
```

For a step with its own `for_each`, the entry is a map of the revisions of that host's instances, keyed by instance key:

```text
{ for k, v in conn3x_package.web__tools : k => v.revision if startswith(k, "${each.key}/") }
```

Because every step depends on the step before it, the dependency on the last step means each handler instance waits until every step in the circuit has finished on every host.

### When a handler instance runs

`conn3x_service_action` runs its action only when it's created:

- When the triggers changed, or are unknown at plan time, the plan replaces the instance. The apply deletes the old one, which does nothing on the host, and creates the new one, which runs `systemctl restart` or `systemctl reload` on that host.
- When the triggers are unchanged, nothing runs. If only `name` or `action` changed, the instance is updated in place, which records the new settings and runs nothing.
- When there is no instance yet, it's created, so the action runs. That's why a handler runs on the first apply of a circuit, and on a host newly added to `hosts`.

A refresh reads nothing for a handler: its instance has no state on the host, so it never shows drift.

## Following one change through

Take a circuit where step `config` writes `/etc/nginx/nginx.conf` on `web1` and `web2` and notifies handler `reload`. You change the file's `content` and run `conn3x apply`:

1. The plan finds that `conn3x_file.web__config["web1"]` and `["web2"]` need an update. Their `sha256` changes, so each revision is planned as unknown.
2. Each handler instance's `triggers` now holds an unknown value, so the plan replaces `conn3x_service_action.web__reload["web1"]` and `["web2"]`.
3. The apply writes the file on both hosts and gives each instance a new revision.
4. After the last step has finished on both hosts, the apply creates the two handler instances, which reload nginx on each host.

Had the content changed for `web1` only, the `web2` instance of the step would keep its revision, the `web2` handler instance would keep its triggers, and nginx would be reloaded on `web1` only.

## Drift

A refresh puts what it read from the host into the stored object before the plan compares. If someone edited `/etc/nginx/nginx.conf` on `web1` by hand, the refreshed state holds the edited content, the comparison with your configuration finds a difference, and the revision is planned as unknown. From there it goes as above: the apply writes your content back, the revision changes, and the handler runs on `web1`.

So putting back a hand edit runs the handler, even though the file then matches what the previous apply wrote.

With [`-refresh=false`](/internals/plan-reads#-refreshfalse), nothing is read, the stored object still matches your configuration, and neither the step nor the handler changes.

If a host [doesn't answer during the refresh](/internals/plan-reads#when-a-host-doesnt-answer), its steps keep their stored state, so drift on that host isn't seen in that plan either.

## Using revision yourself

`revision` is an ordinary attribute, so other steps can watch it too. A `command` step's `triggers` runs the command again when its value changes, and a `reboot` step's `triggers` reboots the host:

```hcl
circuit "app" {
  hosts = {
    app1 = "10.0.1.5"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "kernel_args" {
    line {
      path   = "/etc/default/grub"
      regexp = "^GRUB_CMDLINE_LINUX="
      line   = "GRUB_CMDLINE_LINUX=\"quiet\""
    }
  }

  step "reboot" {
    reboot {
      triggers = { args = conn3x_line.app__kernel_args[each.key].revision }
    }
  }
}
```

The reboot runs on the first apply and again on each apply that changes the line on that host, including one that puts back a hand edit.

## Related

- [Handlers](/reference/circuits/handlers) covers the `handler` block and `notify`.
- [State layout for host steps](/internals/state) lists what else each instance stores.
