---
title: CLI overview
description: How to run conn3x commands, the global options, the environment variables Conn3x reads, and its exit codes.
---

The `conn3x` binary has every command OpenTofu 1.13.2 has, and two of its own: [`drift`](/reference/cli/drift) and [`convert ansible`](/reference/cli/convert-ansible). This section documents Conn3x v0.6.1.

## Usage

```sh
conn3x [global options] <subcommand> [args]
```

Run `conn3x` with no arguments, or `conn3x -help`, to list the commands. Add `-help` after a command to see its options:

```sh
conn3x plan -help
conn3x state rm -help
```

Command options start with a single dash. Give a value with `=` or a space, `-out=tfplan` or `-out tfplan`. A boolean option that is on by default is turned off with `=false`, as in `-refresh=false`. Global options go before the subcommand.

## Global options

| Option | Description |
| --- | --- |
| `-chdir=DIR` | Switch to `DIR` before running the subcommand. Relative paths in the command's options, such as `-var-file` or `-out`, are then relative to `DIR`. |
| `-help` | Show the list of commands, or a command's help when used after it. |
| `-version` | The same as `conn3x version`. |
| `-install-autocomplete` | Install tab completion for `conn3x` in your shell's startup file. |
| `-uninstall-autocomplete` | Remove it again. |

## Commands

These are the commands most people use. Each has its own page.

| Command | What it does |
| --- | --- |
| [`init`](/reference/cli/init) | Prepare a working directory: install providers and modules, set up the backend. |
| [`validate`](/reference/cli/validate) | Check that the configuration, circuits included, is valid. |
| [`plan`](/reference/cli/plan) | Read the cloud and the hosts, and show what would change. |
| [`apply`](/reference/cli/apply) | Make the planned changes. |
| [`destroy`](/reference/cli/destroy) | Remove everything the configuration manages. |
| [`drift`](/reference/cli/drift) | Report what changed outside Conn3x since the last apply. Conn3x only. |
| [`convert ansible`](/reference/cli/convert-ansible) | Turn an Ansible playbook into circuits. Conn3x only. |
| [`show`](/reference/cli/show) | Show the state or a saved plan. |
| [`state`](/reference/cli/state) | List, inspect, move and remove items in state. |
| [`output`](/reference/cli/output) | Print output values. |
| [`fmt`](/reference/cli/fmt) | Format configuration files. |
| [`providers`](/reference/cli/providers) | Show the providers the configuration needs. |
| [`version`](/reference/cli/version) | Print the Conn3x version. |

The other OpenTofu commands are there too and behave as OpenTofu documents them: [`console`](https://opentofu.org/docs/cli/commands/console/), [`force-unlock`](https://opentofu.org/docs/cli/commands/force-unlock/), [`get`](https://opentofu.org/docs/cli/commands/get/), [`graph`](https://opentofu.org/docs/cli/commands/graph/), [`import`](https://opentofu.org/docs/cli/commands/import/), [`login`](https://opentofu.org/docs/cli/commands/login/), [`logout`](https://opentofu.org/docs/cli/commands/logout/), [`refresh`](https://opentofu.org/docs/cli/commands/refresh/), [`taint`](https://opentofu.org/docs/cli/commands/taint/), [`test`](https://opentofu.org/docs/cli/commands/test/), [`untaint`](https://opentofu.org/docs/cli/commands/untaint/) and [`workspace`](https://opentofu.org/docs/cli/commands/workspace/). `conn3x metadata functions -json` prints the signatures of the functions available in configuration.

## What differs from OpenTofu

- The binary is `conn3x`, and help and messages say Conn3x.
- The `conn3x` provider is built into the binary. `init` doesn't download it, and it needs no `required_providers` entry. Its address is `terraform.io/builtin/conn3x`.
- Configuration is read from `.circuit.hcl` files as well as `.tf` and `.tofu` files.
- `init` warns when state isn't encrypted. See [init](/reference/cli/init).
- `plan`, `apply`, `destroy`, `refresh` and `drift` connect to your hosts over SSH to read host steps. See [plan](/reference/cli/plan).
- `fmt` formats `.circuit.hcl` files too. See [fmt](/reference/cli/fmt).
- Host steps can't be imported with `conn3x import` or `import` blocks.
- `version` prints the Conn3x version and the OpenTofu release it's built on. With `-json`, it adds `conn3x_version` to OpenTofu's fields.
- In `-json` output, the version message that starts the stream names the Conn3x release, and carries a `conn3x` field beside the `tofu` one.

## Environment variables

### Conn3x

| Variable | Description |
| --- | --- |
| `CONN3X_HMAC_KEY` | The key for the HMACs that state keeps instead of write-only file content. It must be at least 32 bytes; `openssl rand -hex 32` makes one. Without it, Conn3x uses `~/.config/conn3x/hmac.key`, and creates that file the first time it writes a write-only secret. Every machine that runs against the same state needs the same key. See [Secrets in files](/concepts#secrets-in-files). |
| `XDG_CONFIG_HOME` | When set, the key file is `$XDG_CONFIG_HOME/conn3x/hmac.key` instead. |
| `SSH_AUTH_SOCK` | The SSH agent Conn3x logs in with when an `ssh` block has no `private_key_file`. |

### Inherited from OpenTofu

| Variable | Description |
| --- | --- |
| `TF_VAR_name` | Sets the input variable `name`. `TF_VAR_region=nyc3` sets `var.region`. |
| `TF_ENCRYPTION` | State and plan encryption configuration, in HCL or JSON. It's merged with any `encryption` block in the configuration. See [OpenTofu's state encryption](https://opentofu.org/docs/language/state/encryption/). |
| `TF_CLI_ARGS` | Extra options added to every command. `TF_CLI_ARGS_name` adds options to one command only, such as `TF_CLI_ARGS_plan="-parallelism=4"`. |
| `TF_INPUT` | Set to `false` or `0` to turn off interactive prompts for variables, like `-input=false`. |
| `TF_IN_AUTOMATION` | Any value leaves out the messages that suggest which command to run next, for output read in CI logs. |
| `TF_LOG` | Log level written to standard error: `TRACE`, `DEBUG`, `INFO`, `WARN` or `ERROR`. |
| `TF_LOG_PATH` | Write the log to this file instead. |
| `TF_DATA_DIR` | Where `init` keeps its working files. Defaults to `.terraform`. |
| `TF_WORKSPACE` | Selects the workspace, like `conn3x workspace select`. |
| `TF_PLUGIN_CACHE_DIR` | A directory to cache downloaded providers in. |
| `TF_CLI_CONFIG_FILE` | The CLI configuration file. Defaults to `~/.tofurc`. |

OpenTofu documents the rest in [Environment variables](https://opentofu.org/docs/cli/config/environment-variables/).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success. |
| 1 | An error, an unknown command, or an option that isn't valid. |
| 2 | `plan -detailed-exitcode` and `drift`: success, with changes. |
| 3 | `fmt -check`: some files need formatting. `convert ansible`: some tasks need you. |
| 127 | A command that only groups subcommands, such as `conn3x state`, run without one. |
