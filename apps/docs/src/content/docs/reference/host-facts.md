---
title: Host facts
description: Read a host's operating system, architecture, CPUs and memory at plan time, with the conn3x_host data source.
---

`conn3x_host` reads facts about a server over SSH when you plan, so the rest of the configuration can depend on them: a package that's called something else on Debian, a setting sized to the machine's memory.

```hcl
data "conn3x_host" "web1" {
  ssh {
    host             = "203.0.113.10"
    user             = "root"
    private_key_file = "~/.ssh/id_ed25519"
  }
}
```

It takes the same `ssh` block as a circuit, with `host` set to the server's address, and checks the host key the same way.

## Attributes

| Name | Type | Description |
| --- | --- | --- |
| `os_family` | string | `"redhat"` or `"debian"`. |
| `os_id` | string | The `ID` from os-release, such as `rocky` or `ubuntu`. |
| `os_version` | string | The `VERSION_ID` from os-release, such as `10.0` or `24.04`. |
| `arch` | string | Machine architecture, such as `x86_64` or `aarch64`. |
| `cpus` | number | Number of CPUs. |
| `memory_mb` | number | Total memory in MiB. |
| `ipv4` | string | Source address of the default IPv4 route, or empty. |

## Facts for every host in a circuit

Read the facts for each host with `for_each`, then look them up by the host's name inside a step:

```hcl
locals {
  hosts = { web1 = "203.0.113.10", web2 = "203.0.113.11" }
}

data "conn3x_host" "facts" {
  for_each = local.hosts
  ssh {
    host             = each.value
    user             = "root"
    private_key_file = "~/.ssh/id_ed25519"
  }
}

circuit "web" {
  hosts = local.hosts

  ssh {
    user             = "root"
    private_key_file = "~/.ssh/id_ed25519"
  }

  step "apache" {
    package {
      name = data.conn3x_host.facts[each.key].os_family == "debian" ? "apache2" : "httpd"
    }
  }
}
```

Facts are read fresh on every plan and aren't stored as anything to change, so they never show up as drift.

## Hosts that don't exist yet

A host created in the same plan has no facts to read until the apply makes it, and neither does a host behind a `depends_on` on the module, which holds the read back until the apply. Until then every fact is unknown.

Using a fact inside a step's arguments, as in the example above, is fine: the plan shows `(known after apply)` for that value and the apply fills it in. Using a fact to decide which hosts a circuit runs on, or how many instances a `for_each` has, isn't. The plan fails with `Invalid for_each argument`, because it has to know which steps exist.

When a circuit splits its hosts by distribution, let the caller say what each new host will be. The official circuits take an `os` in each host object and fall back to the facts:

```hcl
data "conn3x_host" "facts" {
  for_each = var.hosts
  ssh {
    host     = try(each.value.address, each.value)
    host_key = try(each.value.host_key, null)
  }

  lifecycle {
    postcondition {
      condition     = try(each.value.os, self.os_id) == self.os_id
      error_message = "Host ${each.key} is ${self.os_id}, not the ${try(each.value.os, "")} its os says."
    }
  }
}

locals {
  os       = { for name, h in var.hosts : name => try(h.os, data.conn3x_host.facts[name].os_id) }
  apt_hosts = { for name, h in var.hosts : name => h if contains(["debian", "ubuntu"], local.os[name]) }
}
```

`try` takes `os` when the host object has it and never reads the facts for that host. The postcondition checks it against the real host once the facts can be read, so a wrong `os` fails the apply before any step runs on that host.
