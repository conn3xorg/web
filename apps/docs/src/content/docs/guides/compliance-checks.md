---
title: Check a baseline without changing anything
description: Report which hosts break CIS-style rules, such as root SSH login, password ageing and world-writable files, from a plan that changes nothing.
---

Before anyone lets a tool change production, they ask what's wrong with it today. Compliance teams ask first, and they want the answer without a single setting moved.

Conn3x answers from a plan. The `conn3x_command` data source runs a read-only command on each host when you plan. An OpenTofu `check` block compares what came back with the rule, and reports every host that breaks it. Nothing on the host changes, and a failed check is a warning, not an error, so the plan still finishes.

The three checks below follow items found in the CIS benchmarks for Linux: root can't log in over SSH, passwords expire within a year, and there are no world-writable files. They were run against two Ubuntu 24.04 hosts, one set up to pass and one to fail.

## The hosts

The checks read a map of hosts, so they cover the same fleet as your circuits:

```hcl
variable "hosts" {
  type = map(string)
  default = {
    web1 = "10.0.1.10"
    web2 = "10.0.1.11"
  }
}
```

Each data source below runs once per host with `for_each`. Its `ssh` block takes the same settings as a circuit's, and `become = true` runs the command through `sudo`.

## Root login over SSH

`sshd -T` prints the settings sshd really uses, after every `Include` and `Match`, so a drop-in file in `sshd_config.d` can't hide a `PermitRootLogin yes`:

```hcl
data "conn3x_command" "root_login" {
  for_each = var.hosts
  command  = "sshd -T | grep -i '^permitrootlogin '"

  ssh {
    host   = each.value
    user   = "ops"
    become = true
  }
}

locals {
  root_login = [for h, d in data.conn3x_command.root_login : h if trimspace(nonsensitive(d.stdout)) != "permitrootlogin no"]
}

check "ssh_root_login" {
  assert {
    condition     = length(local.root_login) == 0
    error_message = "Root can log in over SSH on ${join(", ", local.root_login)}."
  }
}
```

A command's output is marked sensitive, since it could hold a secret. `nonsensitive` is fine here because a setting's name and value aren't secret. Don't wrap anything that could be.

## Password ageing

```hcl
data "conn3x_command" "pass_max_days" {
  for_each = var.hosts
  command  = "awk '$1 == \"PASS_MAX_DAYS\" { print $2 }' /etc/login.defs"

  ssh {
    host = each.value
    user = "ops"
  }
}

locals {
  pass_age = [for h, d in data.conn3x_command.pass_max_days : h if tonumber(trimspace(nonsensitive(d.stdout))) > 365]
}

check "password_max_age" {
  assert {
    condition     = length(local.pass_age) == 0
    error_message = "PASS_MAX_DAYS is over 365 on ${join(", ", local.pass_age)}."
  }
}
```

This one reads a file anyone can read, so it doesn't need `become`. `PASS_MAX_DAYS` applies to passwords set from now on. Accounts that exist keep the maximum `chage` gave them.

## World-writable files

```hcl
data "conn3x_command" "world_writable" {
  for_each = var.hosts
  command  = "find / -xdev -type f -perm -0002 2>/dev/null | head -n 20"

  ssh {
    host   = each.value
    user   = "ops"
    become = true
  }
}

locals {
  writable = {
    for h, d in data.conn3x_command.world_writable :
    h => split("\n", trimspace(nonsensitive(d.stdout))) if trimspace(nonsensitive(d.stdout)) != ""
  }
}

check "world_writable_files" {
  assert {
    condition     = length(local.writable) == 0
    error_message = join("; ", [for h, files in local.writable : "${h}: ${join(", ", files)}"])
  }
}
```

`-xdev` keeps `find` on the root filesystem, out of `/proc` and network mounts. It still reads every directory, which takes a while on a big disk, and it runs at every plan. Keep a check like this in its own configuration that you plan on a schedule, rather than next to your circuits.

## What the plan says

On the two test hosts, `web1` passed everything and `web2` failed all three:

```text
No changes. Your infrastructure matches the configuration.

Warning: Check block assertion failed

  on cis.tf line 54, in check "ssh_root_login":
  54:     condition     = length(local.root_login) == 0

Root can log in over SSH on web2.

Warning: Check block assertion failed

  on cis.tf line 61, in check "password_max_age":

PASS_MAX_DAYS is over 365 on web2.

Warning: Check block assertion failed

  on cis.tf line 68, in check "world_writable_files":

web2: /etc/oops
```

## Failing a CI job

The plan exits 0 even when checks fail. To fail a scheduled job instead, read the warnings from `-json`:

```shell
conn3x plan -input=false -json > checks.json
jq -r 'select(.type == "diagnostic" and .diagnostic.summary == "Check block assertion failed") | .diagnostic.detail' checks.json
test -z "$(jq -r 'select(.type == "diagnostic" and .diagnostic.summary == "Check block assertion failed")' checks.json)"
```

The last line exits 1 when any check failed.

## Then fix them

Each finding has a step that fixes it. A `line` step with `regexp = "^PermitRootLogin"` sets the SSH rule. Another on `/etc/login.defs` sets `PASS_MAX_DAYS`. Put those in a circuit when you're ready to change things, and keep the checks to prove they stayed fixed.
