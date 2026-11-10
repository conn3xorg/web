---
title: conn3x apply
description: Make the changes in a plan, in the cloud and on your hosts.
---

`conn3x apply` makes the changes a plan proposes. Without a plan file, it plans first, shows the plan, and asks you to confirm. With a plan file from `conn3x plan -out`, it applies that plan without asking.

## Usage

```sh
conn3x apply [options] [PLAN]
```

## What Conn3x changes

Host steps are applied over SSH, alongside cloud resources, in one run:

- Within a circuit, steps run in the order you write them. A circuit whose `hosts` refers to a resource, such as a server's address, waits for that resource.
- A [handler](/reference/circuits/handlers) runs after the steps that notify it, and only on the hosts where one of them changed something.
- The first time Conn3x writes [write-only content](/concepts#secrets-in-files) without `CONN3X_HMAC_KEY` set, it creates `~/.config/conn3x/hmac.key`.

If a step fails on one host, `apply` reports the error and exits 1. State keeps everything that finished, so the next plan picks up where it stopped.

Planning works as described on the [plan](/reference/cli/plan) page, including reading the hosts first.

## Sample output

```text
$ conn3x apply
...
Plan: 3 to add, 0 to change, 0 to destroy.

Do you want to perform these actions?
  Conn3x will perform the actions described above.
  Only 'yes' will be accepted to approve.

  Enter a value: yes

...
Apply complete! Resources: 3 added, 0 changed, 0 destroyed.
```

## Options

| Option | Description |
| --- | --- |
| `-auto-approve` | Don't ask for confirmation. Applying a plan file never asks. |
| `-input=false` | Don't prompt for variables. With no plan file, also use `-auto-approve`. |
| `-parallelism=N` | How many resource operations run at once, host steps included. Defaults to `10`. |
| `-lock=false` | Don't lock state. |
| `-lock-timeout=DURATION` | How long to retry a state lock, such as `30s`. |
| `-json` | Write machine-readable output as JSON lines. Needs `-auto-approve` or a plan file. |
| `-no-color` | Don't use terminal colors. |
| `-compact-warnings` | Show warnings as summaries only, when there are no errors. |
| `-concise` | Leave out progress messages. |
| `-show-sensitive` | Show sensitive values. |
| `-report=FILE` | Write a JSON report of the run to `FILE`. See [-report](#-report). Not with `-json`. |

Without a plan file, `apply` also takes the planning options from [plan](/reference/cli/plan#options): `-var`, `-var-file`, `-target`, `-exclude`, `-replace`, `-refresh=false`, `-refresh-only` and `-destroy`. With a plan file, those were fixed when the plan was made.

For the remaining options, see [OpenTofu's `apply` page](https://opentofu.org/docs/cli/commands/apply/).

## Examples

Plan and apply in one step, confirming at the prompt:

```sh
conn3x apply
```

Apply a saved plan:

```sh
conn3x plan -out=tfplan
conn3x apply tfplan
```

If state changed between the two commands, `apply` refuses the plan as stale. Plan again.

Apply in CI without prompts:

```sh
conn3x apply -auto-approve -input=false
```

Accept what changed outside Conn3x into state, without changing any host:

```sh
conn3x apply -refresh-only
```

## -report

`-report=run.json` writes a report of the run when apply finishes, whether it succeeded or not: each host's steps, what happened to each, how long it took, and any error as the terminal printed it. It's for CI, dashboards and tickets, which want the result without parsing a log. New in v0.10.0, and [experimental](/reference/maturity).

```sh
conn3x apply -auto-approve -report=run.json
```

```json
{
  "format_version": "1",
  "conn3x_version": "v0.10.0",
  "command": "apply",
  "started": "2026-11-08T18:00:05.00494Z",
  "finished": "2026-11-08T18:00:20.102056Z",
  "success": true,
  "hosts": {
    "box": {
      "steps": [
        {
          "step": "try.tools",
          "address": "conn3x_package.try__tools[\"box\"]",
          "module": "package",
          "action": "create",
          "changed": true,
          "status": "ok",
          "seconds": 15
        }
      ]
    }
  },
  "cloud": [],
  "drift": [],
  "errors": []
}
```

That's the [try-it-locally](/tutorials/try-locally) circuit's first apply, cut to its first step.

- **Hosts** are keyed by their name in the circuit's `hosts`, with steps in the order they were planned. A step in a `for_each` loop has an `item`.
- **`status`** is `ok`, `failed` or `skipped`. A skipped step has a `reason`, such as `an earlier step failed on this host`.
- **`cloud`** lists every resource that isn't a host step, such as a server.
- **No values.** A report holds addresses, actions, timings and errors, and never an attribute's value, since reports get copied to other systems. An error is kept as printed, so a command that printed a secret in its error would carry it, and the file is written readable by its owner only. Since v0.12.0 that holds for a report that was already there with a wider mode, and a link at the path is replaced, not followed.

The format is the JSON Schema at [docs.conn3x.org/schemas/report-1.json](https://docs.conn3x.org/schemas/report-1.json). Within format version `1`, fields are only added, never changed or removed.

`-report` doesn't go with `-json`: that stream on standard output already has everything. To keep the human output and the JSON lines both, use `-json-into`.

[`conn3x drift`](/reference/cli/drift#-report) takes `-report` too.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Applied, or nothing to do. |
| 1 | An error, or you didn't confirm. |
