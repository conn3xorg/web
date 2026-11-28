---
title: "Ask the host, then decide: steps that wait for the apply"
description: "Conn3x v0.39.0 adds only_if and probe, so a step can depend on what an earlier step left on the host, decided during the apply. Here's the problem it solves, what the plan shows, and what it did for converted Ansible roles."
date: 2026-12-29
author: James Conway
---

Every Ansible role I've read has this shape somewhere. Install a thing. Ask the host whether the thing worked. Do the next bit only if it didn't.

```yaml
- name: Install the agent
  ansible.builtin.package:
    name: acme-agent

- name: Is it already enrolled?
  ansible.builtin.command: acme-agent status
  register: enrolled
  changed_when: false
  failed_when: false

- name: Enroll it
  ansible.builtin.command: acme-agent enroll --token-file /etc/acme/token
  when: enrolled.rc != 0
```

Ansible can do that because it never plans. It runs the tasks top to bottom and looks at the host as it goes. Conn3x plans first, the way OpenTofu does, so you can read what's about to happen before anything happens. And that's exactly where this pattern used to fall apart. At plan time the agent isn't installed yet, so there's nothing to ask. A step's `when` has to be known when you plan, and the answer to "is it enrolled?" only exists halfway through the apply.

So until now, `conn3x convert ansible` left tasks like the last two for you, with a note that said, more or less, "this asks the host after something changed it, and I can't know the answer yet". On the 36 Galaxy roles we convert as a yardstick, 27 tasks said exactly that.

## Two new things: probe and only_if

v0.39.0 lets a step wait for the apply to decide whether it runs:

```hcl
circuit "agent" {
  hosts = var.hosts

  step "agent" {
    package {
      name = "acme-agent"
    }
  }

  probe "enrolled" {
    command = "acme-agent status"
  }

  step "enroll" {
    only_if = data.conn3x_command.agent__enrolled[each.key].exit_code != 0
    command {
      command = "acme-agent enroll --token-file /etc/acme/token"
    }
  }
}
```

A `probe` runs a read-only command and gives you its `exit_code` and `stdout`. It waits for every step declared before it, so you don't write `depends_on`, and you can't forget one. If nothing before it is changing, it reads at plan, like any data source. If something is, it reads during the apply, after those steps have run.

`only_if` goes on any Linux or Windows step. True, the step runs as it always did. False, it does nothing on the host, and Conn3x records it as skipped. Its handlers don't fire, and it doesn't own anything it didn't touch. When the answer isn't known yet at plan, the step waits.

## What you see in the plan

The plan can't tell you something it doesn't know, and it doesn't pretend to:

```text
  # data.conn3x_command.agent__enrolled["web1"] will be read during apply
  # (depends on a resource or a module with changes pending)

  # conn3x_command.agent__enroll["web1"] will be created
  + resource "conn3x_command" "agent__enroll" {
      + command   = "acme-agent enroll --token-file /etc/acme/token"
      + only_if   = (write-only attribute)
      + skipped   = (known after apply)
      ...
```

`skipped = (known after apply)` means the step will run, or be skipped, during the apply. The summary still counts it, so "3 to change" can turn into "1 changed". The plan can overstate what happens. It never understates it: nothing changes on the host that the plan didn't list.

And on the second run, when the agent is installed and enrolled, the probe reads at plan, the answer is known, and the plan says "No changes". That last part took the most work. A condition that flips from "not enrolled" to "enrolled" after the step did its job must not look like drift forever after, so `only_if` is never stored, and what's kept is only the outcome.

## "is changed" didn't need any of this

Ansible's other habit is `when: thing is changed`: run this only if that task did something. You can already say that with a step's `revision`, which changes exactly when Conn3x changes that step on the host. Put it in the later step's `triggers` and you're done. No probe, nothing decided late.

## What it did for converted roles

The converter now uses both. A read-only task that registers a result after the host has changed becomes a `probe`. A `when` on its exit code, its output, or whether a path exists becomes `only_if`, and the parts that only depend on facts and defaults stay in `when`. On those 36 roles, 14 more tasks convert, 190 up to 204, and all 27 "asks the host after something changed it" notes are gone. Most of the tasks that still stop have moved on to their next blocker, which is how a long tail shrinks.

One case still comes to you on purpose. If a `command` probe doesn't say `failed_when: false`, Ansible stops the play when the command fails, and a probe wouldn't. Converting that would change what your role does, so the converter asks.

## Is this new?

Partly, and I'd rather be exact than loud. OpenTofu needs every `for_each` known at plan. Terraform has an experiment, deferred actions, that plans what it can and leaves the rest for another plan and apply, so it converges over several rounds. Pulumi lets you branch inside an `apply`, but its own docs warn that the preview then won't show the resources it creates. Ansible branches freely and has no plan at all.

What Conn3x adds is small: the decision happens during one apply, the skip is recorded so the next plan is clean, and the plan shows the step with its outcome left open. Nothing in OpenTofu changed to make it work. The data source waits for the apply, as OpenTofu already lets it, and the step reads the answer.

If you've got a role full of `register`, convert it again with v0.39.0 and see what comes across. If something converts that shouldn't, or stays that shouldn't, [open an issue](https://github.com/conn3xorg/conn3x/issues). That's how the last 14 got there.
