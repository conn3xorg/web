---
title: conn3x plan
description: Read the cloud and the hosts, and show what Conn3x would change.
---

`conn3x plan` compares the configuration with what exists, and shows the changes that would make them match. It changes nothing. Save the plan with `-out` to apply exactly those changes later.

## Usage

```sh
conn3x plan [options]
```

## What Conn3x changes

### Plan reads your hosts

Before it compares, `plan` refreshes state: it reads every resource again, the way OpenTofu does. In Conn3x that includes host steps. For each step instance already in state, Conn3x connects to the host over SSH and reads the current state of what the step manages: a file's content and mode, whether a package is installed, whether a service is running. The plan then shows the difference between that and your configuration.

- A step that isn't in state yet is planned as a create without connecting. Conn3x connects when you apply it.
- A refresh connects with the `ssh` settings recorded in state, from the last apply.
- If what a step manages is gone from the host, such as a deleted file, the plan creates it again.
- [`conn3x_host`](/reference/host-facts) data sources connect during every plan to read facts.
- A host that doesn't answer is retried for the `ssh` block's `timeout`, 3 minutes by default. After that, the plan fails.
- If state holds [write-only content](/concepts#secrets-in-files), reading it needs the same HMAC key that wrote it, from `CONN3X_HMAC_KEY` or `~/.config/conn3x/hmac.key`.

Host reads count against `-parallelism`, like any other resource operation.

`-refresh=false` skips the reads. The plan then compares the configuration with state alone, and won't notice changes made by hand. `conn3x_host` data sources are still read.

### Host step addresses

A step `NAME` in circuit `CIRCUIT` is the resource `conn3x_MODULE.CIRCUIT__NAME`, with one instance per host. Quote the address in your shell when you pass it to `-target` or `-replace`:

```sh
conn3x plan -target='conn3x_file.web__page["web1"]'
```

## Sample output

Abridged:

```text
Conn3x will perform the following actions:

  # conn3x_package.web__nginx["web1"] will be created
  # conn3x_file.web__page["web1"] will be created
  # conn3x_service.web__running["web1"] will be created

Plan: 3 to add, 0 to change, 0 to destroy.
```

When the cloud and the hosts already match:

```text
No changes. Your infrastructure matches the configuration.
```

## Options

### Planning modes

| Option | Description |
| --- | --- |
| `-destroy` | Plan to remove everything the configuration manages. What happens to a host step depends on its module's `on_remove`. See [destroy](/reference/cli/destroy). |
| `-refresh-only` | Plan only to update state to match what was read, and propose nothing else. [`conn3x drift`](/reference/cli/drift) uses this mode. |

### Plan customization

| Option | Description |
| --- | --- |
| `-var 'NAME=VALUE'` | Set an input variable. Repeat it for more. |
| `-var-file=FILE` | Read variables from a file, in addition to `terraform.tfvars` and `*.auto.tfvars`. Repeat it for more. |
| `-target=ADDRESS` | Plan only this resource, module or instance, and what it depends on. Repeat it for more. For exceptional use only. |
| `-target-file=FILE` | Read `-target` addresses from a file. |
| `-exclude=ADDRESS` | Plan everything except this address and what depends on it. Can't be used with `-target`. |
| `-exclude-file=FILE` | Read `-exclude` addresses from a file. |
| `-replace=ADDRESS` | Plan to replace this instance even if it hasn't changed. For a host step, Conn3x removes it, following its `on_remove`, and applies it again. A `command` step runs again, unless its guards say it has already done its job. |
| `-refresh=false` | Don't read the cloud or the hosts first. |

### Output and behaviour

| Option | Description |
| --- | --- |
| `-out=FILE` | Save the plan to a file for `conn3x apply FILE`. |
| `-detailed-exitcode` | Exit 2 instead of 0 when the plan has changes. See [Exit codes](#exit-codes). |
| `-input=false` | Don't prompt for variables that aren't set. Use this in automation. |
| `-json` | Write machine-readable output as JSON lines. |
| `-no-color` | Don't use terminal colors. |
| `-compact-warnings` | Show warnings as summaries only, when there are no errors. |
| `-concise` | Leave out progress messages. |
| `-show-sensitive` | Show sensitive values instead of `(sensitive value)`. |
| `-parallelism=N` | How many resource operations run at once, host reads included. Defaults to `10`. |
| `-lock=false` | Don't lock state. Dangerous when others run Conn3x against the same state. |
| `-lock-timeout=DURATION` | How long to retry a state lock, such as `30s`. |

For the remaining options, see [OpenTofu's `plan` page](https://opentofu.org/docs/cli/commands/plan/).

## Examples

Save a plan, then apply exactly that plan:

```sh
conn3x plan -out=tfplan
conn3x apply tfplan
```

Plan with variables from a file, without prompts:

```sh
conn3x plan -var-file=prod.tfvars -input=false
```

Run a `command` step on one host again:

```sh
conn3x plan -replace='conn3x_command.app__migrate["web1"]' -out=tfplan
```

Fail a CI job when the plan isn't empty:

```sh
conn3x plan -detailed-exitcode -input=false
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | The plan succeeded. With `-detailed-exitcode`, it also means the plan is empty. |
| 1 | An error, such as a host that can't be reached. |
| 2 | Only with `-detailed-exitcode`: the plan succeeded and has changes. A change to outputs alone counts. |
