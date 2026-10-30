---
title: conn3x drift
description: Report what changed outside Conn3x since the last apply, in the cloud and on your hosts.
---

`conn3x drift` reads every resource and host step again and reports what no longer matches the last apply. It groups the results into cloud resources and host steps. It changes nothing: not the cloud, not the hosts, and not state.

This command is Conn3x only. For how to use it, see [Find drift](/guides/drift).

## Usage

```sh
conn3x drift [options]
```

## How it works

`drift` runs `conn3x plan -refresh-only -detailed-exitcode -json` with the options you give it, reads the result, and prints a summary. So it reads the hosts the same way [plan](/reference/cli/plan#plan-reads-your-hosts) does, and needs what `plan` needs: an initialized directory, SSH access to every host, values for every variable, and the HMAC key if state holds write-only content.

It never prompts. A variable without a value is an error, so pass it with `-var`, `-var-file` or `TF_VAR_name`.

A resource whose type starts with `conn3x_` is listed under **Hosts**. Everything else is listed under **Cloud**.

When a cloud resource looks changed, `drift` also runs a normal plan. If that plan wouldn't update, replace or delete the resource, it isn't drift. It's listed under **Changed, but your config wouldn't change them back**, and doesn't affect the exit code. A run with no changed cloud resources does one plan, and a run with some does two.

## Output

When something changed:

```text
$ conn3x drift
Drift found in 2 resources.

Cloud
  ~ digitalocean_droplet.web  changed

Hosts
  ~ conn3x_file.web__page["web1"]  changed
  - conn3x_file.web__motd["web1"]  gone

Run conn3x plan to see what Conn3x would change to put them back.
```

`changed` means the object still exists but differs from state. `gone` means it no longer exists, such as a file someone deleted.

When nothing changed:

```text
No drift: the cloud and the hosts match the last apply.
```

When the only difference is in output values:

```text
Only outputs changed since the last apply; the cloud and the hosts match it.
```

Errors are printed after the drift list, each starting with `Error:`. A host that doesn't answer is one of them: `plan` only warns about it, but `drift` can't say a host it couldn't read hasn't changed.

`drift` shows which objects changed, not how. Run `conn3x plan` to see the attribute-level diff and what Conn3x would do to put things back.

## Options

`drift` accepts the options of [plan](/reference/cli/plan#options). These are the useful ones:

| Option | Description |
| --- | --- |
| `-var 'NAME=VALUE'` | Set an input variable. Repeat it for more. |
| `-var-file=FILE` | Read variables from a file. Repeat it for more. |
| `-target=ADDRESS` | Check only this address and what it depends on. Repeat it for more. |
| `-exclude=ADDRESS` | Check everything except this address. |
| `-parallelism=N` | How many resources are read at once. Defaults to `10`. |
| `-lock=false` | Don't lock state while reading it. |
| `-lock-timeout=DURATION` | How long to retry a state lock. |

`-json` is an error. For the same reads as JSON lines, run `conn3x plan -refresh-only -json`, which is what `drift` runs underneath. `-destroy` is an error too, because a refresh-only plan can't also destroy.

## Examples

Check for drift:

```sh
conn3x drift
```

Check one circuit's file step on every host:

```sh
conn3x drift -target=conn3x_file.web__page
```

Check a configuration that lives in a subdirectory:

```sh
conn3x -chdir=infra drift
```

Run it on a schedule, and fail the job when anything drifted:

```sh
conn3x drift -var-file=prod.tfvars -no-color
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | No drift. |
| 1 | An error, including a host that didn't answer. Any drift found before the error is still listed. |
| 2 | Something drifted, or only output values changed. |

## Limitations

`TF_CLI_ARGS_drift` is ignored. `drift` runs its plan as a new `conn3x plan` process, so `TF_CLI_ARGS_plan` and `TF_CLI_ARGS` apply instead.
