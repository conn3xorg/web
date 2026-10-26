---
title: conn3x validate
description: Check configuration and circuits for errors without contacting any cloud or host.
---

`conn3x validate` checks that the configuration in a directory is valid: the syntax, the attribute names and types, and the references between blocks. It reads only the files. It doesn't read state, call cloud APIs, or connect to hosts, so it's safe to run in an editor or on every commit.

`validate` needs an initialized directory. In CI, `conn3x init -backend=false` is enough.

## Usage

```sh
conn3x validate [options] [DIR]
```

`DIR` defaults to the current directory.

## What Conn3x changes

`validate` checks circuits in `.circuit.hcl` and `.tf` files as well as the rest of the configuration. It reports, among other things, a step that names a module that doesn't exist, and warns about a handler that no step notifies:

```text
$ conn3x validate
Warning: Unused handler

  on main.circuit.hcl line 11, in circuit "web":
  11:   handler "reload" {

No step in circuit "web" notifies handler "reload", so it never runs.

Error: Unknown module "pakage"

  on main.circuit.hcl line 7, in circuit "web":
   7:     pakage {

Supported modules are "archive", "authorized_key", "block", "command",
"cron", "directory", "download", "file", "firewalld", "git", "group",
"hostname", "line", "link", "locale", "mount", "package", "reboot",
"repository", "selinux_boolean", "selinux_fcontext", "service", "sysctl",
"template", "timer", "timezone", "ufw", "user", "wait_for".
```

With no errors, it prints:

```text
Success! The configuration is valid.
```

Because `validate` doesn't connect to hosts, it can't tell you whether a host is reachable, whether its key is in `known_hosts`, or whether a package exists there. `conn3x plan` finds those.

## Options

| Option | Description |
| --- | --- |
| `-json` | Print the result as one JSON object, with `valid`, `error_count`, `warning_count` and `diagnostics`. |
| `-no-color` | Don't use terminal colors. |
| `-no-tests` | Don't validate test files. |
| `-test-directory=PATH` | Where to look for test files. Defaults to `tests`. |
| `-var` and `-var-file` | Set input variables, as in [plan](/reference/cli/plan#options). |

See [OpenTofu's `validate` page](https://opentofu.org/docs/cli/commands/validate/) for the JSON format.

## Examples

```sh
conn3x init -backend=false
conn3x validate
```

Check a module in another directory:

```sh
conn3x validate modules/web
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Valid. Warnings don't change this. |
| 1 | Not valid, or another error. |
