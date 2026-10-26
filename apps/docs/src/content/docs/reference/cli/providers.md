---
title: conn3x providers
description: Show the providers the configuration and state need, including the built-in conn3x provider.
---

`conn3x providers` prints the providers the configuration requires, module by module, and the providers that resources in state belong to. Use it to see why a provider is needed or which version constraint applies.

## Usage

```sh
conn3x providers [options]
conn3x providers lock [options] [PROVIDER...]
conn3x providers mirror [options] DIR
conn3x providers schema -json
```

## What Conn3x changes

Circuits and `conn3x_host` use the `conn3x` provider, `terraform.io/builtin/conn3x`. It's built into the binary, so it has no version to select, isn't downloaded, and isn't written to the lock file. `providers` lists it like any other. Here the configuration has a circuit and a `terraform_data` resource, and only the `terraform_data` resource has been applied:

```text
$ conn3x providers

Providers required by configuration:
.
├── provider[terraform.io/builtin/conn3x]
└── provider[terraform.io/builtin/terraform]

Providers required by state:

    provider[terraform.io/builtin/terraform]
```

## Subcommands

| Subcommand | What it does |
| --- | --- |
| `providers lock` | Write or update `.terraform.lock.hcl` with checksums for more platforms, with `-platform=OS_ARCH`. Built-in providers are skipped. |
| `providers mirror DIR` | Download the required providers into `DIR`, for a mirror that machines without internet access can use. Built-in providers are skipped. |
| `providers schema -json` | Print every provider's schema as JSON, the built-in `conn3x` provider's resources and data source included. Editors and tools can read module arguments from it. |

For their options, see OpenTofu's pages for [`providers`](https://opentofu.org/docs/cli/commands/providers/), [`providers lock`](https://opentofu.org/docs/cli/commands/providers/lock/), [`providers mirror`](https://opentofu.org/docs/cli/commands/providers/mirror/) and [`providers schema`](https://opentofu.org/docs/cli/commands/providers/schema/).

## Examples

Lock checksums for Linux and macOS:

```sh
conn3x providers lock -platform=linux_amd64 -platform=darwin_arm64
```

List the arguments of the `file` module:

```sh
conn3x providers schema -json \
  | jq '.provider_schemas["terraform.io/builtin/conn3x"].resource_schemas.conn3x_file.block.attributes | keys'
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success. |
| 1 | An error. |
