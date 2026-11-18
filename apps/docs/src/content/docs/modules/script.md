---
title: script
description: "A module you write yourself, in any language the host runs. Conn3x keeps the plan, state and drift."
---

When no module does what you need, you can write one. A script step runs a program from your circuit's directory, in Python, shell or anything else the host has, and Conn3x does the rest: it copies the program to the host, runs it with `become`, shows its changes in the plan, keeps its state and notices drift.

New in v0.26.0, and [experimental](/reference/maturity): the protocol may change between releases.

```hcl
step "env" {
  script {
    source      = "${path.module}/modules/kv.py"
    interpreter = ["python3"]
    args        = { path = "/etc/app.env", key = "MODE", value = "prod" }
  }
}
```

## Arguments

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | string | Yes | The program, a file in the circuit's directory. Up to 1 MiB. |
| `interpreter` | list(string) | No | Runs the program with these first, such as `["python3"]`. Unset runs it by its `#!` line. |
| `args` | any | No | What the program is told to do. It gets them as JSON, and they're in the plan and state. |
| `args_wo` | any | No | Arguments kept out of the plan and state, such as a password. The program gets them in `apply` only. |
| `on_remove` | string | No | `"forget"` (default) leaves the host as it is when the step is removed; `"delete"` runs the program's `remove`. |

## Read-only attributes

| Name | Type | Description |
| --- | --- | --- |
| `state` | string | What the program's `read` returned, as JSON. |
| `changes` | string | What the program's `plan` said would change, as JSON. |
| `in_sync` | bool | Whether the program's `plan` found nothing to change. |
| `program_sha256` | string | The program's SHA-256, so an edited program plans a change. |
| `revision` | string | Changes each time Conn3x changes this on the host. Handlers watch it. |

## Writing the program

The program reads one JSON object on stdin and prints one on stdout. Conn3x runs it once per call, each with a `mode`:

```json
{"mode": "plan", "args": {"key": "MODE", "value": "prod"}, "state": {"value": "dev"}}
```

| Mode | It should | It prints |
| --- | --- | --- |
| `read` | Look at the host. | `{"state": {...}}`, what's there now. |
| `plan` | Compare `state` with `args`, and change nothing. | `{"in_sync": true}`, or `{"in_sync": false, "changes": [...]}`. |
| `apply` | Make the host match `args`. | `{"state": {...}, "changed": true}` |
| `remove` | Undo what it did. Only with `on_remove = "delete"`. | `{}` |

`state` and `changes` are yours to shape; Conn3x stores them and shows `changes` in the plan as written. To fail, print `{"error": "what went wrong"}` or exit non-zero, and the step fails with your message.

Here is the program from the example, which keeps one `KEY=VALUE` line in a file:

```python
#!/usr/bin/env python3
import json, os, sys

req = json.load(sys.stdin)
a = req["args"]
path, key, value = a["path"], a["key"], a["value"]

def current():
    try:
        with open(path) as f:
            for line in f:
                k, _, v = line.rstrip("\n").partition("=")
                if k == key:
                    return v
    except FileNotFoundError:
        pass
    return None

mode = req["mode"]
if mode == "read":
    out = {"state": {"value": current()}}
elif mode == "plan":
    have = (req["state"] or {}).get("value")
    out = {"in_sync": have == value,
           "changes": [] if have == value else [{"path": key, "before": have, "after": value}]}
elif mode == "apply":
    lines = []
    if os.path.exists(path):
        with open(path) as f:
            lines = [l for l in f.read().splitlines() if l.partition("=")[0] != key]
    lines.append(f"{key}={value}")
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")
    out = {"state": {"value": value}, "changed": True}
else:
    out = {}
print(json.dumps(out))
```

## Secrets

Put secrets in `args_wo`, never in `args`. They reach the program in `apply` only, on stdin, and are never written to the plan or state.

Don't return them. Whatever a program prints as `state` or `changes` is stored, so Conn3x refuses a result that holds an `args_wo` value, whole or inside a longer string such as `TOKEN=...` or a URL, and the step fails without saving it. Return a hash or a placeholder instead. Conn3x can't spot a secret the program has encoded first, such as in base64, so that's yours to avoid.

## How it works

- The program is copied to `/var/lib/conn3x/modules/<sha256>` on the host, owned by root and mode `0700`, and only when that file isn't already there. Its hash is checked after the copy, before it's used.
- Writing there needs root, so a script step needs `become`, or a login that can write `/var/lib/conn3x`.
- Each refresh runs `read`, then `plan` against what `read` returned, so a hand edit on the host shows as drift.
- The program runs with the same locale, umask and output limits as every other step.
