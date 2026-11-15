---
title: JSON output
description: The -json stream that plan, apply, destroy and refresh write, and how to tell which host and step each event is about.
---

Building a dashboard, a CI check or a bot on top of Conn3x? Read the `-json` stream, not the terminal output. The human output can change in any release. The stream is meant for programs.

`plan`, `apply`, `destroy` and `refresh` take `-json`. For drift as JSON, run `conn3x plan -refresh-only -json`. Each line on standard output is then one JSON object, one event. To keep the human output on the terminal and write the stream to a file too, use `-json-into=FILE` instead.

```sh
conn3x apply -auto-approve -json > run.jsonl
```

## The events

The stream is OpenTofu's [machine-readable UI](https://opentofu.org/docs/internals/machine-readable-ui/), so a tool that reads OpenTofu's `-json` reads this one. Every line has `type`, `@level`, `@message`, `@module` and `@timestamp`. These are the types a host step shows up in:

| `type` | When |
| --- | --- |
| `version` | First line. `conn3x` is the Conn3x release, `tofu` the OpenTofu one, `ui` the stream's version. |
| `planned_change` | Plan: a step will run on a host. `change.action` says how, such as `create`, `update`, `replace` or `delete`. |
| `resource_drift` | Plan: a host no longer matches what the last apply left. |
| `change_summary` | Plan or apply: the counts. |
| `apply_start` | Apply: a step starts on a host. |
| `apply_progress` | Apply: still running, every 10 seconds. |
| `apply_complete` | Apply: the step finished on that host. |
| `apply_errored` | Apply: the step failed on that host. The error itself comes as a `diagnostic`. |
| `diagnostic` | A warning or an error, with the file and line it's about. |
| `outputs` | Last: the root module's outputs. |

## Which host and step

A circuit's step becomes one resource instance per host, and its address is generated: step `build` in circuit `box`, on host `web1`, is `conn3x_command.box__build["web1"]`. Since v0.21.0, you don't need to know that. Every `resource` object in the stream carries a `conn3x` object saying what the instance is:

```json
{
  "type": "apply_complete",
  "@message": "conn3x_command.box__build[\"web1\"]: Creation complete after 1s [id=127.0.0.1:22:command]",
  "hook": {
    "resource": {
      "addr": "conn3x_command.box__build[\"web1\"]",
      "module": "",
      "resource_type": "conn3x_command",
      "resource_name": "box__build",
      "resource_key": "web1",
      "conn3x": { "circuit": "box", "step": "build", "host": "web1" }
    },
    "action": "create",
    "elapsed_seconds": 1
  }
}
```

That's from a real apply, with fields that don't matter here cut.

- **`circuit`** and **`step`** are the names in the circuit file. For a handler, `step` is the handler's name.
- **`host`** is the host's name in the circuit's `hosts`.
- **`item`** is there only for a step with `for_each`: the key of the item this instance is for.
- **`module`**, beside it, is the module path when the circuit is called as a module, such as `module.web`.

A resource that isn't a circuit step, such as a cloud server, has no `conn3x` object.

## What changes, and what doesn't

The `conn3x` object and its four fields keep their names and meanings. New fields may be added to any event, so ignore the ones you don't know. Removing a field or changing what one means would bump the major part of `ui` in the `version` line, so check it once at the start.

The stream doesn't carry values. For what a step changes, attribute by attribute, save the plan and read it with [`conn3x show -json`](/reference/cli/show). For a run's results without reading events at all, [`apply -report`](/reference/cli/apply#-report) writes one file with every host's steps and how each went.
