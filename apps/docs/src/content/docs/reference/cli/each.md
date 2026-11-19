---
title: "conn3x each: plan every root configuration"
description: Plan every root configuration in a repository in the order they read each other's state, or only the ones a change touched.
---

A repository with one configuration per site or environment usually ends up with a CI job that loops over directories and plans all of them, every time. `conn3x each plan` does the loop for you, in the right order, and with `-changed` it plans only what a change could affect.

```sh
conn3x each plan
conn3x each plan -changed=origin/main
```

It finds every root configuration under the current directory, works out which ones read another's state, and plans them in that order. At the end you get one line per configuration:

```text
app: changes
db: no changes
network: no changes
report: skipped: network didn't plan
```

This command is Conn3x only, and new in v0.27.0. It's [experimental](/reference/maturity): it plans, and doesn't apply yet.

## Usage

```sh
conn3x each plan [-changed=REF] [-parallelism=N] [-keep-going] [-detailed-exitcode] [PLAN-ARG ...]
```

Arguments after the options go to every plan, such as `-lock-timeout=60s` or `-var-file=prod.tfvars`.

## Options

| Option | What it does |
| --- | --- |
| `-changed=REF` | Plan only the configurations a change since `REF` touched, and those that depend on them. |
| `-parallelism=N` | Plan up to `N` configurations at once, among those that don't depend on each other. Defaults to 1, so the output stays in order. |
| `-keep-going` | Keep starting plans after one fails. A configuration whose dependency failed is skipped either way. |
| `-detailed-exitcode` | Exit 2 when any plan has changes and none failed, as `plan -detailed-exitcode` does. |

It exits 0 when every plan succeeded and 1 when any failed.

## Which directories it plans

A root configuration is a directory with `.tf` or `.circuit.hcl` files that no other configuration calls as a local module. A directory that's called as a module but has a `backend` block of its own counts as a root too. `.terraform`, `.git`, `node_modules` and directories starting with a dot are left out.

## How it orders them

One configuration depends on another when it reads the other's state with `terraform_remote_state`. `conn3x each` matches the data source to the configuration whose backend writes that state, by the settings that say which state it is:

| Backend | Matched on |
| --- | --- |
| `s3` | `bucket` and `key` |
| `gcs` | `bucket` and `prefix` |
| `azurerm` | `storage_account_name`, `container_name` and `key` |
| `local` | `path`, from each side's own directory. A configuration with no backend writes `terraform.tfstate` in its directory. |

So this reads `network`, wherever `network` lives in the tree:

```hcl
data "terraform_remote_state" "network" {
  backend = "s3"
  config  = { bucket = "acme-tf", key = "prod/network.tfstate", region = "eu-west-1" }
}
```

Both sides have to be literal for that to work. When either isn't, such as a `key` from a variable or a backend set with `-backend-config`, the plan warns, names the data source, and carries on without that edge. Say it yourself in `conn3x.each.hcl` beside the configuration that reads:

```hcl
depends_on = ["../network"]
watch      = ["../policies", "../common.tfvars"]
```

`depends_on` lists configurations this one reads from. `watch` lists paths outside its directory that it reads, such as a shared `.tfvars` file or a policy, so a change to them counts as a change to this configuration. Paths are relative to the file.

Configurations that depend on each other in a circle are an error.

## What `-changed` counts

The change is everything since `REF`: the commits (`git diff REF...HEAD`), edits you haven't committed, and new files git doesn't ignore. A file moved from one configuration to another changes both.

A configuration is planned when a changed file is:

- in its directory,
- in a local module it calls, at any depth, or
- in a path its `conn3x.each.hcl` watches.

Anything that depends on a planned configuration is planned as well, since the outputs it reads may move. What a configuration depends on isn't planned unless it changed too.

Files that `init`, `plan` and `apply` write on their own don't count: anything under `.terraform/`, local state files and their backups, and a lock file that isn't committed yet.

A configuration the change deleted is named in the summary:

```text
old: removed by this change, but its resources are still in its state; destroy them from origin/main first, or move them
```

Its resources don't go away because its files did, so nothing plans their removal. Destroy them from the old commit, or move them into another configuration's state, before you merge.

## How it runs

Each configuration gets `conn3x init -input=false` first, one at a time, since several inits at once can race on a shared plugin cache. Then the plans run level by level: a configuration plans after everything it depends on, and up to `-parallelism` plans run together within a level. Each plan's output is printed whole when it finishes, with every line starting with its directory.

When a plan fails, no new level starts, unless you pass `-keep-going`. A configuration whose dependency failed is reported as skipped.

## In CI

```yaml
- uses: conn3xorg/setup-conn3x@v1
- run: conn3x each plan -changed=origin/${{ github.base_ref }} -detailed-exitcode
```

Fetch enough history for `REF` to exist: `actions/checkout` with `fetch-depth: 0`, or at least the base branch.

## Not yet

- `conn3x each apply`. Applying across configurations needs a plan for what happens when one fails halfway down the order, and the plan side's use will show what that should be.
- JSON output.
- `.tf.json` files, which aren't read.
