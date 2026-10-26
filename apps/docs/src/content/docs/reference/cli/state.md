---
title: conn3x state
description: List, inspect, rename and forget the cloud resources and host steps in state.
---

`conn3x state` has subcommands for looking at and changing state directly. Use them to find an address, read what Conn3x recorded, rename something without re-applying it, or stop managing something without touching it.

## Host steps in state

Conn3x keeps cloud resources and host steps in one state. A step `NAME` in circuit `CIRCUIT`, using module `MODULE`, is the resource `conn3x_MODULE.CIRCUIT__NAME`, with one instance per host, keyed by the host's name in `hosts`:

```text
digitalocean_droplet.web
conn3x_package.web__nginx["web1"]
conn3x_file.web__page["web1"]
conn3x_service.web__running["web1"]
```

A [repeated step](/reference/circuits/steps#for_each) has one instance per host and item, keyed `"HOST/ITEM"`.

Each instance records what Conn3x last read from or wrote to the host, and the `ssh` settings it used. The next refresh connects with those settings.

Instance addresses contain quotes and brackets, so quote them in your shell:

```sh
conn3x state show 'conn3x_file.web__page["web1"]'
```

The subcommands below only change state. None of them connects to a host or changes anything on it.

With local state, `state mv` and `state rm` write a timestamped backup, such as `terraform.tfstate.1792974433.backup`, before they change anything.

## state list

```sh
conn3x state list [options] [ADDRESS...]
```

Lists every resource instance in state, one address per line. Give addresses to list only those resources or modules.

| Option | Description |
| --- | --- |
| `-id=ID` | List only instances whose `id` attribute equals `ID`. |

```sh
$ conn3x state list conn3x_file.web__page
conn3x_file.web__page["web1"]
conn3x_file.web__page["web2"]
```

An address that isn't in state is an error.

## state show

```sh
conn3x state show [options] ADDRESS
```

Shows the attributes of one instance.

| Option | Description |
| --- | --- |
| `-show-sensitive` | Show sensitive values. |
| `-json` | Print JSON. |

## state mv

```sh
conn3x state mv [options] SOURCE DESTINATION
```

Moves an object to a new address. Use it when you rename a step, a circuit, or a host's name in `hosts`, so the next plan sees the same object under its new name instead of removing one and creating another.

| Option | Description |
| --- | --- |
| `-dry-run` | Print what would move, and change nothing. |
| `-lock=false` | Don't lock state. |
| `-lock-timeout=DURATION` | How long to retry a state lock. |

Rename step `page` to `index` in circuit `web`, on every host at once:

```sh
conn3x state mv conn3x_file.web__page conn3x_file.web__index
```

Rename host `web1` to `web-1`. Run it once for every step and handler in the circuit:

```sh
conn3x state mv 'conn3x_file.web__page["web1"]' 'conn3x_file.web__page["web-1"]'
```

Make the matching change in the configuration, then run `conn3x plan` to check that it shows no changes for what you moved.

## state rm

```sh
conn3x state rm [options] ADDRESS...
```

Removes objects from state, so Conn3x stops managing them. For a host step, nothing on the host changes, whatever the step's `on_remove` says. A cloud resource keeps existing.

If the step is still in the configuration, the next plan creates it again. Remove it from the configuration too if you want Conn3x to stop managing it.

| Option | Description |
| --- | --- |
| `-dry-run` | Print what would be removed, and change nothing. |
| `-lock=false` | Don't lock state. |
| `-lock-timeout=DURATION` | How long to retry a state lock. |

```sh
conn3x state rm 'conn3x_file.web__page["web1"]'
```

```text
Removed conn3x_file.web__page["web1"]
Successfully removed 1 resource instance(s).
```

Removing and applying again is also how to recover a write-only file when the HMAC key that wrote it is lost. See [Secrets in files](/concepts#secrets-in-files).

## Other subcommands

| Subcommand | What it does |
| --- | --- |
| `state pull` | Print the raw state to standard output. |
| `state push FILE` | Replace the state with a local state file. `-force` skips the lineage and serial checks. |
| `state replace-provider FROM TO` | Change the provider that resources in state belong to. |

All the `state` subcommands also take `-var` and `-var-file`, and `-no-color`. For everything else, see OpenTofu's pages for [`state list`](https://opentofu.org/docs/cli/commands/state/list/), [`state show`](https://opentofu.org/docs/cli/commands/state/show/), [`state mv`](https://opentofu.org/docs/cli/commands/state/mv/), [`state rm`](https://opentofu.org/docs/cli/commands/state/rm/), [`state pull`](https://opentofu.org/docs/cli/commands/state/pull/), [`state push`](https://opentofu.org/docs/cli/commands/state/push/) and [`state replace-provider`](https://opentofu.org/docs/cli/commands/state/replace-provider/).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success. |
| 1 | An error, such as an address that isn't in state. |
