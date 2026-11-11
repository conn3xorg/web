---
title: Installed packages and services
description: Read which packages a host has installed, and the state of its services, at plan time, with the conn3x_packages and conn3x_services data sources.
---

`conn3x_packages` and `conn3x_services` read a host over SSH when you plan, like [`conn3x_host`](/reference/host-facts): which packages are installed, at which versions, and what state each systemd service is in. They're for checks and audits: a postcondition that fails when a host runs a version with a known hole, or a report of every host where a service is masked. New in v0.14.0.

```hcl
data "conn3x_packages" "web1" {
  ssh {
    host             = "203.0.113.10"
    user             = "root"
    private_key_file = "~/.ssh/id_ed25519"
  }
}

data "conn3x_services" "web1" {
  ssh {
    host             = "203.0.113.10"
    user             = "root"
    private_key_file = "~/.ssh/id_ed25519"
  }
}
```

Both take the same `ssh` block as a circuit and check the host key the same way. Neither needs root, and neither reads Windows: a Windows host is an error at plan.

## They read the host before the apply

Both read at plan time, so they show the host **before** this apply's steps run. A `package` step that installs nginx doesn't make `packages["nginx"]` appear in the same run, and a `service` step that starts it doesn't make its `state` read `active` until the next plan. Ansible's `package_facts` and `service_facts` can be gathered again partway through a play; these can't. Check what a step did with the step's own result, or in the next plan.

## conn3x_packages

| Name | Type | Description |
| --- | --- | --- |
| `packages` | map of string | Each installed package's version, by name. Where several versions are installed, the newest. |
| `versions` | map of list of string | Every installed version of each package, oldest first, by the same names. |

Versions are in the form the [`package`](/modules/package) module shows and its `version` takes: dpkg's version on Debian and Ubuntu, such as `1.24.0-2ubuntu7`, and `epoch:version-release` on the Red Hat family, such as `0:1.26.3-1.el10`. On Debian and Ubuntu, a package counts as installed when dpkg says so, held packages included.

**Names.** A package for the host's own architecture, or for none (`all`, `noarch`), goes under its bare name, so a circuit written for both families can look up `bash` either way. A package for another architecture goes under the name its own tools print, and the two families differ:

- Debian and Ubuntu: `libc6:i386`, as `dpkg -l` prints it.
- Red Hat family: `glibc.i686`, as `rpm -q` prints it.

**Several versions.** dpkg installs one version of a package per architecture. rpm can install several side by side, as it does with kernels. `packages` holds the newest, ordered as rpm orders versions, and `versions` holds them all:

```hcl
output "kernels" {
  value = data.conn3x_packages.web1.versions["kernel"]
}
# ["0:5.14.0-503.el10", "0:5.14.0-570.el10"]
```

## conn3x_services

| Name | Type | Description |
| --- | --- | --- |
| `services` | map of object | Each systemd service by name, without `.service`, as a [`service`](/modules/service) step takes it. |

Each service has:

| Name | Type | Description |
| --- | --- | --- |
| `state` | string | systemd's ActiveState: `active`, `inactive`, `failed`, `activating` and so on. |
| `enabled` | bool | Whether its unit file starts it at boot: true for `enabled` and `enabled-runtime` only. |
| `unit_file_state` | string | systemd's own word: `enabled`, `disabled`, `static`, `masked`, `indirect`, `generated` and so on. |

`enabled` is for a simple check. `masked`, `static`, `indirect` and `generated` all read false, so when the difference matters, such as "is it masked?", read `unit_file_state`.

**Which services.** Every service unit file, and every loaded instance of a template, such as `getty@tty1`. A template itself isn't listed. An instance whose name systemd escapes keeps the escaped name, as `systemctl` prints it: `systemd-fsck@dev-disk-by\x2duuid-1234`. An alias, such as `sshd` for `ssh` on Debian, is listed under its own name too, with its target's state.

## Checking every host

Read both for each host with `for_each`, then check them in a postcondition, which fails the plan before any step runs:

```hcl
data "conn3x_packages" "hosts" {
  for_each = local.hosts
  ssh {
    host             = each.value
    user             = "root"
    private_key_file = "~/.ssh/id_ed25519"
  }

  lifecycle {
    postcondition {
      condition     = !contains(keys(self.packages), "telnetd")
      error_message = "${each.key} has telnetd installed."
    }
  }
}

data "conn3x_services" "hosts" {
  for_each = local.hosts
  ssh {
    host             = each.value
    user             = "root"
    private_key_file = "~/.ssh/id_ed25519"
  }

  lifecycle {
    postcondition {
      condition     = try(self.services["auditd"].enabled, false)
      error_message = "${each.key} doesn't start auditd at boot."
    }
  }
}
```

A host created in the same plan has nothing to read until the apply makes it, as with [`conn3x_host`](/reference/host-facts#hosts-that-dont-exist-yet), so both are unknown for it until then.
