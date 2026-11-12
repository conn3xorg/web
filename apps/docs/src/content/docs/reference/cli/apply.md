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

If a step fails on one host, `apply` reports the error and exits 1. State keeps everything that finished, so the next plan picks up where it stopped. [When a step fails](#when-a-step-fails) shows it with five hosts.

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

## When a step fails

An apply that fails part of the way through doesn't have to start again. State records each step on each host as it finishes, so the next apply does only what's left.

Here are five hosts and three steps, where the middle step fails on `web3`:

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.11"
    web2 = "203.0.113.12"
    web3 = "203.0.113.13"
    web4 = "203.0.113.14"
    web5 = "203.0.113.15"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "app_dir" {
    directory {
      path = "/srv/app"
    }
  }

  step "migrate" {
    command {
      command = "/srv/app/bin/migrate && touch /srv/app/migrated"
      creates = "/srv/app/migrated"
    }
  }

  step "config" {
    file {
      path    = "/srv/app/app.conf"
      content = "ready = true\n"
    }
  }
}
```

**The first apply** creates the directory on all five hosts and runs the migration on four. On `web3` it fails, and the apply exits 1:

```text
$ conn3x apply
...
Plan: 15 to add, 0 to change, 0 to destroy.
...
conn3x_command.web__migrate["web1"]: Creation complete after 0s [id=…]
conn3x_command.web__migrate["web4"]: Creation complete after 0s [id=…]
conn3x_command.web__migrate["web2"]: Creation complete after 0s [id=…]
conn3x_command.web__migrate["web5"]: Creation complete after 0s [id=…]

Error: command failed with exit status 1:
database not reachable

  with conn3x_command.web__migrate["web3"],
  on main.circuit.hcl line 23, in circuit "web":
```

**The next plan,** once `web3` can reach its database, reads every step that finished, on every host, and finds nothing to do for them. On `web1`, `web2`, `web4` and `web5`, the directory and the migration are refreshed and left out of the plan: the migration doesn't run there again. What's left is the migration on `web3` and the step after it:

```text
$ conn3x plan
conn3x_directory.web__app_dir["web1"]: Refreshing state... [id=…]
...
conn3x_command.web__migrate["web1"]: Refreshing state... [id=…]
conn3x_command.web__migrate["web2"]: Refreshing state... [id=…]
conn3x_command.web__migrate["web4"]: Refreshing state... [id=…]
conn3x_command.web__migrate["web5"]: Refreshing state... [id=…]
...
  # conn3x_command.web__migrate["web3"] will be created
  # conn3x_file.web__config["web1"] will be created
  # conn3x_file.web__config["web2"] will be created
  # conn3x_file.web__config["web3"] will be created
  # conn3x_file.web__config["web4"] will be created
  # conn3x_file.web__config["web5"] will be created

Plan: 6 to add, 0 to change, 0 to destroy.
```

The `config` step is there for every host because the circuit runs in lockstep, the default: no host starts a step until the one before it has finished on every host, so the failure on `web3` held all five back. An apply finishes the six, and the plan after it shows `No changes.`

**With `strategy = "per_host"`,** each host runs its own chain of steps, so the other four carried on to the end in the first apply. The next plan has only `web3`'s two steps:

```text
$ conn3x plan
...
  # conn3x_command.web__migrate["web3"] will be created
  # conn3x_file.web__config["web3"] will be created

Plan: 2 to add, 0 to change, 0 to destroy.
```

In both cases, a step that finished on a host isn't run there again. What `strategy` changes is how far each host got before the failure. See [`strategy`](/reference/circuits/steps#per-host).

Conn3x doesn't print a line for each host it has nothing to do on. To see where an apply did something, and where it didn't, use [`-report`](#-report): after the `per_host` run above, the report of the second apply lists `web3` and no other host.

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
| `-limit=PATTERN` | Apply circuit steps only on the hosts that match, and leave every other host's steps as they are. Not with a plan file: give it to `plan` instead. See [plan's -limit](/reference/cli/plan#-limit). New in v0.15.0. |
| `-batch-size=N` | For a circuit with `batch_size`, the batch size for this run: a number of hosts, or a percentage such as `20%`. See [Batches](#batches). New in v0.15.0. |
| `-max-failures=N` | For a circuit with `batch_size`, how many hosts may fail for this run before no more batches start. See [Batches](#batches). New in v0.15.0. |

Without a plan file, `apply` also takes the planning options from [plan](/reference/cli/plan#options): `-var`, `-var-file`, `-target`, `-exclude`, `-replace`, `-refresh=false`, `-refresh-only`, `-destroy` and `-limit`. With a plan file, those were fixed when the plan was made.

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

## Batches

A circuit with [`batch_size`](/reference/circuits) rolls out a few hosts at a time, as a play with Ansible's `serial` does, and stops starting batches once more hosts have failed than `max_failures` allows. Use it when a bad change should reach two servers, not all twenty. New in v0.15.0.

```hcl
circuit "web" {
  hosts        = var.web_hosts
  strategy     = "per_host"
  batch_size   = 2      # or a percentage, such as "20%"
  max_failures = 0      # the default

  ...
}
```

`conn3x apply` then:

1. Plans everything, shows the plan and asks once, or goes ahead with `-auto-approve`.
2. Cuts the hosts that have changes into batches, in name order, with `web2` before `web10`. A host with nothing to change isn't in any batch. A percentage is of the hosts that change, rounded up, and a batch always has at least one host.
3. For each batch, plans again with [`-limit`](/reference/cli/plan#-limit) set to its hosts, and applies that plan. A batch's plan may only make changes the plan you approved had; anything else stops the run, since something changed in between.
4. After a batch fails, plans its hosts again to see which still have changes left. Those count as failed. Once more hosts have failed than `max_failures`, no more batches start, and apply lists the hosts that failed and the ones it never reached.

```text
$ conn3x apply
...
Plan: 5 to add, 0 to change, 0 to destroy.

Circuit "web" changes 5 hosts, which roll out in 3 batches of up to 2. No more batches start once more than 0 hosts have failed.

Do you want to perform these actions in batches?
  Only 'yes' will be accepted to approve.

  Enter a value: yes

Batch 1 of 3: web1, web2
...
Batch 2 of 3: web3, web4
...
Error: 1 host failed, more than max_failures = 0, so no more batches start.
  Failed: web3
  Not reached: web5
```

When every batch runs but some hosts failed within `max_failures`, apply still exits 1 and names them. When none failed, it ends with `All 3 batches applied.` The next apply works as [When a step fails](#when-a-step-fails) describes: it batches only the hosts with something left to do.

`-batch-size` and `-max-failures` override the circuit's values for one run:

```sh
conn3x apply -batch-size=1 -max-failures=2
```

Each plan and apply in the rollout takes the state lock for itself, so the lock isn't held from the first batch to the last.

What a batched apply doesn't do yet:

- A lockstep circuit, where every host waits for every other: `batch_size` needs `strategy = "per_host"`. `conn3x validate` says so.
- A [`run_once`](/reference/circuits/steps#run_once) step in a batched circuit, since no one batch holds every host. Also an error at validate.
- More than one batched circuit in the root module. Apply them one at a time with `-target`, or take `batch_size` off all but one.
- Other changes in the same plan. If the plan also changes resources outside the batched circuit, apply lists them and stops. Apply those first, with `-target`.
- A saved plan, `-destroy`, `-target`, `-exclude`, `-limit`, `-json`, `-json-into` or `-report`. Each is refused.
- `-input=false` without `-auto-approve`, since nobody can answer the question.
- The `remote` and `cloud` backends.
- A circuit in a child module. Batching is read from the circuits in the root module.

`-batch-size` or `-max-failures` without a circuit that has `batch_size` is an error.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Applied, or nothing to do. |
| 1 | An error, or you didn't confirm. |
