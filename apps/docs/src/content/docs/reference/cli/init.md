---
title: conn3x init
description: Prepare a working directory, and see whether its state is encrypted.
---

`conn3x init` prepares a directory of configuration for the other commands. It sets up the backend, downloads the modules and providers the configuration uses, and writes the dependency lock file. Run it first in a new directory, and again after you add a module or provider or change the backend. It's safe to run more than once.

## Usage

```sh
conn3x init [options]
```

## What Conn3x changes

**The conn3x provider is built in.** Circuits and `conn3x_host` use the `conn3x` provider, which is part of the binary. `init` doesn't download it, it needs no `required_providers` entry, and it isn't recorded in `.terraform.lock.hcl`. A configuration with only circuits needs no network access to initialize.

```text
Initializing the backend...

Initializing provider plugins...
- terraform.io/builtin/conn3x is built in to Conn3x

Conn3x has been successfully initialized!
```

**It warns when state isn't encrypted.** Conn3x state holds what it reads from your servers as well as your cloud resources. When `init` succeeds and neither the configuration nor `TF_ENCRYPTION` turns on state encryption, it ends with this warning on standard error:

```text
Warning: This configuration's state isn't encrypted

Conn3x state records cloud resources and what it reads from your servers,
and both can include things you'd rather keep private. Turn on state
encryption with an encryption block in the terraform block, or set
TF_ENCRYPTION:
https://opentofu.org/docs/language/state/encryption/
```

The warning doesn't change the exit code, and `init -json` leaves it out, so the output stays JSON. To turn encryption on, add an `encryption` block with a `state` block inside `terraform`:

```hcl
terraform {
  encryption {
    key_provider "pbkdf2" "main" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "main" {
      keys = key_provider.pbkdf2.main
    }
    state {
      method = method.aes_gcm.main
    }
  }
}
```

Or set the same configuration in `TF_ENCRYPTION`, without the `terraform` and `encryption` wrappers. OpenTofu's [state encryption](https://opentofu.org/docs/language/state/encryption/) page covers the key providers and methods.

## Options

| Option | Description |
| --- | --- |
| `-upgrade` | Install the newest module and provider versions the version constraints allow, instead of the versions in the lock file. |
| `-backend-config=PATH` or `-backend-config="KEY=VALUE"` | Add settings to the `backend` block. Repeat it to add more. |
| `-backend=false` | Skip backend initialization and use what was set up before. |
| `-reconfigure` | Set up the backend again, ignoring any saved backend configuration. |
| `-migrate-state` | Set up a changed backend and copy existing state into it. |
| `-force-copy` | Answer yes to the prompts about copying state to a new backend. |
| `-get=false` | Don't download modules. |
| `-lockfile=readonly` | Fail rather than change `.terraform.lock.hcl`. |
| `-plugin-dir=PATH` | Install providers only from this directory. Repeat it for more directories. |
| `-from-module=SOURCE` | Copy a module into the empty working directory before initializing. |
| `-input=false` | Don't prompt for input. |
| `-lock=false` | Don't lock state while migrating it. |
| `-lock-timeout=DURATION` | How long to retry a state lock, such as `30s`. Defaults to `0s`. |
| `-json` | Write output as JSON lines. |
| `-no-color` | Don't use terminal colors. |

For every option, see [OpenTofu's `init` page](https://opentofu.org/docs/cli/commands/init/).

## Examples

Initialize a directory:

```sh
conn3x init
```

Initialize for `validate` in CI, without touching the backend:

```sh
conn3x init -backend=false
```

Pass backend settings that you don't keep in the configuration:

```sh
conn3x init -backend-config=backend.hcl
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Initialized. The encryption warning, if shown, doesn't change this. |
| 1 | An error. |
