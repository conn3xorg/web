---
title: Rescues and always blocks
description: The rescue and always blocks, watches, when each runs and on which hosts, and what they leave in state and in the report.
---

A rescue runs on a host only when a step or handler it watches failed there. Use it to put a host back the way it was when a change breaks it, as Ansible's `rescue` does. New in v0.16.0.

```hcl
circuit "app" {
  hosts = {
    web1 = "203.0.113.10"
    web2 = "203.0.113.11"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "backup" {
    command {
      command = "cp /etc/app/app.conf /var/backups/app.conf"
    }
  }

  step "config" {
    file {
      path    = "/etc/app/app.conf"
      content = file("app.conf")
    }
    notify = [handler.restart]
  }

  handler "restart" {
    service {
      name = "app"
    }
  }

  rescue "restore" {
    watches = [step.config, handler.restart]
    command {
      command = "cp /var/backups/app.conf /etc/app/app.conf && systemctl restart app"
    }
  }
}
```

If the new config won't write on `web2`, or the app won't restart with it, `restore` puts the old file back on `web2` and restarts the app. `web1` is left alone.

This `backup` step runs on every apply. A real circuit would guard it, for example with `creates` or `when`.

## Syntax

```text
rescue "NAME" {
  watches = [step.NAME, handler.NAME, ...]

  for_each = EXPRESSION   # optional
  when     = EXPRESSION   # optional
  on       = EXPRESSION   # optional

  MODULE {
    ...
  }

  lifecycle { ... }        # optional
}
```

A rescue block takes one label, its name. Steps, handlers and rescues in a circuit share names, so a rescue can't be called what a step or handler is.

| Argument | Required | Description |
| --- | --- | --- |
| `watches` | Yes | The steps and handlers in the same circuit that this rescue rescues, as `step.NAME` and `handler.NAME` references. |

Otherwise a rescue is written like a [step](/reference/circuits/steps): one module block, and `for_each`, `when`, `on` and `lifecycle` mean what they mean there. A rescue doesn't take these:

- `depends_on`: a rescue runs after the apply, so there's nothing else for it to wait for.
- `run_once`: a rescue runs on each host where a watched step failed.
- `import`: a rescue is dropped from state once it has run, so there's nothing to import into.
- `notify`: a rescue can't notify a handler yet. Put the restart in the rescue itself, as `restore` does.

Several rescues in a circuit run in the order they're written, on each host where they run.

## When a rescue runs

A plan never shows a rescue. Under the plan, apply says when each one would run:

```text
If config or restart fails on a host, rescue "restore" of circuit "app" runs there.
```

The apply runs as usual. If a watched step or handler fails on any host, then once the apply finishes, Conn3x:

1. Reads which watched steps failed, and on which hosts.
2. Plans the rescues alone, each on the hosts where a step or handler it watches failed.
3. Checks that this plan only runs rescues, then applies it. You approved it with the first plan, so it doesn't ask again.
4. Drops the rescues from state, so the next plan doesn't show them being removed.

```text
Rescuing web2:
conn3x_command.app__restore["web2"]: Creating...
conn3x_command.app__restore["web2"]: Creation complete after 0s [id=203.0.113.11:22:command]

Apply complete! Resources: 1 added, 0 changed, 0 destroyed.

Rescued web2. The apply still fails, because a step failed.
```

A rescue runs only where a watched step or handler failed. A step that was skipped because an earlier step failed hasn't failed, so a rescue watching it doesn't run.

## A rescued apply still fails

Apply exits 1 when a step failed, rescued or not. Ansible counts a rescued host as fine. In CI, though, an exit 0 after a failed restart would let the next change deploy on top of it. The step that failed still shows in the next plan, so you can fix it and apply again.

In the [report](/reference/cli/apply#-report), the failed step keeps `"status": "failed"`, the rescue's steps are listed after it, and the host gets `"rescued": true`:

```json
"web2": {
  "steps": [
    { "step": "app.config", "status": "failed", ... },
    { "step": "app.restore", "status": "ok", ... }
  ],
  "rescued": true
}
```

If a rescue fails too, `rescued` isn't set, and apply says the host may still be as the failed step left it.

## always

An `always` block runs on every host where a step or handler it watches ran, whether it succeeded or failed, as Ansible's `always` does. It's written like a rescue, with `watches`:

```hcl
always "lb_enable" {
  watches = [step.config, handler.restart]
  on      = "lb"
  command {
    command = "lb-enable ${each.key}"
  }
}
```

Under the plan, apply says:

```text
After config or restart runs on a host, always "lb_enable" of circuit "app" runs there.
```

Always blocks run after the rescues, in a plan of their own, and are dropped from state the same way. A watched step with nothing to change isn't part of the apply, so nothing runs after it: an apply with no changes runs no always blocks.

An always block that fails fails the apply, even when every step succeeded.

## With batches

In a [batched](/reference/cli/apply#batches) circuit, each batch's rescues and always blocks run before the next batch starts. A rescued host still counts against `max_failures`. A failed always block doesn't stop the rollout, but apply exits 1 at the end.

## What stops them running

- **A saved plan.** `conn3x apply plan.tfplan` applies the plan in one go, and warns that no rescue will run. Always blocks don't run either.
- **`-target`, `-exclude`, `-json` and `-json-into`.** Apply refuses them in a configuration with rescues, as it does with batches.
- **`-destroy`.** A destroy runs no rescues.
- **A circuit in a child module.** Rescues are read from the circuits in the root module, so a child module's rescues never run.
- **The `remote` and `cloud` backends**, which plan elsewhere.

Converting an Ansible `block` with `rescue` or `always` still leaves a TODO.
