---
title: conn3x destroy
description: Remove everything the configuration manages, and what that means for host steps.
---

`conn3x destroy` removes every object the configuration manages. It's the same as `conn3x apply -destroy`: it plans the removal, shows it, and asks you to confirm.

## Usage

```sh
conn3x destroy [options]
```

## What Conn3x changes

Destroying a cloud resource deletes it, as in OpenTofu. Destroying a host step removes it from state, and what happens on the host depends on the step's module and its `on_remove` setting:

- `"forget"` leaves the host as it is. This is the default for files, packages, users and most settings, so `destroy` can't break a running server by surprise.
- `"delete"` removes what the step made. This is the default for SSH keys, firewall rules, cron jobs and timers, so an old key or an open port isn't left behind.

Each [module's page](/modules/file) gives its default. To remove something from the hosts on destroy, set `on_remove = "delete"` in the step's module block and apply that change before you run `destroy`. Conn3x uses the `on_remove` recorded in state.

When a circuit's hosts are created in the same configuration, `destroy` removes the host steps before the servers they run on.

Like `plan`, `destroy` reads the cloud and the hosts first, unless you pass `-refresh=false`.

## Options

`destroy` takes the options of [apply](/reference/cli/apply#options). The ones used most:

| Option | Description |
| --- | --- |
| `-auto-approve` | Don't ask for confirmation. |
| `-target=ADDRESS` | Destroy only this address and what depends on it. Repeat it for more. |
| `-var` and `-var-file` | Set input variables. |
| `-refresh=false` | Don't read the cloud or the hosts first. |
| `-lock-timeout=DURATION` | How long to retry a state lock. |

To see the plan without destroying anything, run `conn3x plan -destroy`.

For the remaining options, see [OpenTofu's `destroy` page](https://opentofu.org/docs/cli/commands/destroy/).

## Examples

Destroy everything, confirming at the prompt:

```sh
conn3x destroy
```

Stop managing one step on one host:

```sh
conn3x destroy -target='conn3x_file.web__page["web1"]'
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Destroyed, or nothing to destroy. |
| 1 | An error, or you didn't confirm. |
