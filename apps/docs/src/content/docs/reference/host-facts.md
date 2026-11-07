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
| `os_family` | string | `"redhat"` or `"debian"`, or `"windows"` with `allow_windows`. |
| `os_id` | string | The `ID` from os-release, such as `rocky` or `ubuntu`, or `"windows"`. |
| `os_version` | string | The `VERSION_ID` from os-release, such as `10.0` or `24.04`. On Windows, the version, such as `10.0.26100`. |
| `arch` | string | Machine architecture, such as `x86_64` or `aarch64`. |
| `cpus` | number | Number of CPUs. |
| `memory_mb` | number | Total memory in MiB. |
| `ipv4` | string | Source address of the default IPv4 route, or empty. |
| `windows` | object | Windows Server only: see below. Null on Linux. |

## Windows Server

Experimental. A Windows host is an error at plan unless the data source sets `allow_windows = true`:

```hcl
data "conn3x_host" "dc1" {
  allow_windows = true
  ssh {
    host             = "203.0.113.20"
    user             = "azadmin"
    private_key_file = "~/.ssh/id_ed25519"
  }
}
```

Why the opt-in? Plenty of circuits written for Linux pick a package manager with "Debian, or else Red Hat". Hand one of those a Windows host's facts and it would plan cleanly and fail halfway through the apply. Refusing at plan is the kinder failure.

Facts come over the same SSH login the Windows modules use, through one read-only PowerShell script, and only when the Linux script fails first, so a Linux host sees no extra round trip. Windows client editions are refused: Conn3x manages Windows Server.

On Windows, `arch` is `x86_64` or `aarch64`, as on Linux, and `ipv4` is the default route's source address. `windows` holds the rest:

| Name | Type | Description |
| --- | --- | --- |
| `release` | string | `"2025"`, `"2022"` or `"2019"`, from the build number. Empty for a build Conn3x doesn't know. |
| `build` | string | The OS build, such as `26100`. In releases after v0.8.0. |
| `update_revision` | number | The update build revision, such as `2314` in `26100.2314`. It goes up with each cumulative update, so it shows which hosts are behind. In releases after v0.8.0. |
| `edition` | string | Such as `ServerDatacenter` or `ServerStandard`. |
| `installation_type` | string | `Server` with the desktop, or `Server Core`. |
| `hostname` | string | The computer's DNS host name. |
| `domain` | string | The Active Directory domain it belongs to, or its workgroup, such as `WORKGROUP`. |
| `domain_role` | number | `2` standalone server, `3` member server, `4` backup domain controller, `5` primary domain controller (the PDC emulator). |
| `powershell` | string | The Windows PowerShell version, such as `5.1.26100.2314`. |
| `elevated` | bool | Whether the login has an administrator's token. The Windows modules need it. |

A host that doesn't exist yet has no facts at plan, on Windows as on Linux, so the rules in [Hosts that don't exist yet](#hosts-that-dont-exist-yet) apply here too.

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
