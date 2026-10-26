---
title: conn3x show
description: Show the current state, or a saved plan, in readable form or as JSON.
---

`conn3x show` prints the current state, or a plan file saved with `conn3x plan -out`. It reads only state or the file. It doesn't connect to the cloud or the hosts.

## Usage

```sh
conn3x show [options] [PLAN]
```

With no arguments, `show` prints the latest state.

## What Conn3x changes

State holds host steps alongside cloud resources, so `show` lists both. Each host step instance appears under its address, `conn3x_MODULE.CIRCUIT__STEP["HOST"]`, with what Conn3x last read from or wrote to the host, and the `ssh` settings it used to connect.

For a file written with `content_wo`, state has no content. `show` displays `content_hmac` instead, and never the secret. See [Secrets in files](/concepts#secrets-in-files).

## Options

| Option | Description |
| --- | --- |
| `-state` | Show the latest state. This is the default. |
| `-plan=FILE` | Show a saved plan. The same as giving the file as an argument. |
| `-config` | Show the configuration. Needs `-json`. |
| `-module=DIR` | Show the module configuration in `DIR`. Needs `-json`. |
| `-json` | Print machine-readable JSON. |
| `-show-sensitive` | Show sensitive values instead of `(sensitive value)`. |
| `-no-color` | Don't use terminal colors. |

For the JSON formats, see [OpenTofu's `show` page](https://opentofu.org/docs/cli/commands/show/).

## Examples

Show the current state:

```sh
conn3x show
```

Review a saved plan, then apply it:

```sh
conn3x plan -out=tfplan
conn3x show tfplan
conn3x apply tfplan
```

List the address of every host step in the root module, with `jq`:

```sh
conn3x show -json | jq -r '.values.root_module.resources[]
  | select(.mode == "managed" and (.type | startswith("conn3x_")))
  | .address'
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success. |
| 1 | An error, such as a plan file that can't be read. |
