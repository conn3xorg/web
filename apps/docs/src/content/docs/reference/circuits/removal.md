---
title: Removal
description: What happens on a host when a step instance is destroyed, the on_remove argument, and each module's default.
---

When a step instance is destroyed, Conn3x stops managing it. What happens on the host depends on the module, and most modules let you choose with the `on_remove` argument.

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "old_site" {
    file {
      path      = "/etc/nginx/conf.d/old.conf"
      content   = "server { listen 8080; }\n"
      on_remove = "delete"
    }
  }
}
```

## When a step instance is destroyed

A step instance is destroyed when:

- you delete the step from the circuit;
- you remove a host from `hosts`, which destroys that host's instances of every step;
- you remove an item from a step's `for_each`, which destroys that item's instances on every host;
- you run `conn3x destroy`, or apply a plan made with `-destroy`;
- a change forces the instance to be replaced, such as a new `path` for a file. The old instance is destroyed before the new one is created.

## on_remove

| Value | Effect |
| --- | --- |
| `"forget"` | Leave the host as it is. Conn3x only removes the instance from state. |
| `"delete"` | Undo what the step made, as the table below describes for each module. |

Any other value is an error.

Conn3x reads `on_remove` from state, not from the configuration, when it destroys an instance. To change what removal does, set `on_remove` and apply first. Then delete the step, or the host, and apply again. Setting `on_remove` in the same change that deletes the step has no effect, because the step's configuration is gone.

To carry out `"delete"`, Conn3x connects to the host with the `ssh` settings recorded in state, not the ones in the configuration.

## Defaults by module

Most modules default to `"forget"`, so deleting a line of configuration can't take a server down. Modules that grant access or run things on a schedule default to `"delete"`, so that a rotated key, a renamed job or a changed port doesn't leave the old one active.

| Module | Default | What `"delete"` does |
| --- | --- | --- |
| [`authorized_key`](/modules/authorized_key) | `"delete"` | Removes the key from the user's authorized keys. |
| [`block`](/modules/block) | `"forget"` | Takes the managed block back out of the file. |
| [`cron`](/modules/cron) | `"delete"` | Removes the cron job. |
| [`directory`](/modules/directory) | `"forget"` | Removes the directory if it is empty. |
| [`download`](/modules/download) | `"forget"` | Removes the downloaded file. |
| [`file`](/modules/file) | `"forget"` | Removes the file. |
| [`firewalld`](/modules/firewalld) | `"delete"` | Removes the rule, closing the port again. |
| [`group`](/modules/group) | `"forget"` | Removes the group. |
| [`ini`](/modules/ini) | `"forget"` | Removes the option. It doesn't bring back a value the step replaced. |
| [`known_hosts`](/modules/known_hosts) | `"delete"` | Removes that key, so a key you retire stops being trusted. |
| [`limit`](/modules/limit) | `"forget"` | Removes the limit. |
| [`line`](/modules/line) | `"forget"` | Takes the line edit back out of the file. |
| [`link`](/modules/link) | `"forget"` | Removes the symbolic link. |
| [`mount`](/modules/mount) | `"forget"` | Unmounts the file system and removes its fstab entry. |
| [`package`](/modules/package) | `"forget"` | Uninstalls the package. |
| [`pip`](/modules/pip) | `"forget"` | Uninstalls the package. The venv stays. |
| [`replace`](/modules/replace) | `"forget"` | Not allowed: the old text is gone, so the file stays as it is. |
| [`repository`](/modules/repository) | `"forget"` | Removes the repository's files. |
| [`selinux_fcontext`](/modules/selinux_fcontext) | `"forget"` | Removes the file context rule and relabels. |
| [`service`](/modules/service) | `"forget"` | Stops and disables the unit. |
| [`sysctl`](/modules/sysctl) | `"forget"` | Removes the setting's file. The running value stays until the next reboot. |
| [`template`](/modules/template) | `"forget"` | Removes the file. |
| [`timer`](/modules/timer) | `"delete"` | Stops the timer and removes its units. |
| [`ufw`](/modules/ufw) | `"delete"` | Removes the rule, closing the port again. |
| [`user`](/modules/user) | `"forget"` | Removes the account and keeps its home directory. |

For firewall rules, `on_remove` also applies when a change replaces the rule: with the default, the old port is closed before the new rule is added.

### Modules without on_remove

These modules don't take `on_remove`. Destroying their instances changes nothing on the host:

| Module | On removal |
| --- | --- |
| [`archive`](/modules/archive) | The unpacked files stay. |
| [`command`](/modules/command) | Nothing runs. |
| [`git`](/modules/git) | The checkout stays. |
| [`hostname`](/modules/hostname) | The hostname stays. |
| [`locale`](/modules/locale) | The locale stays. |
| [`reboot`](/modules/reboot) | Nothing happens. |
| [`selinux_boolean`](/modules/selinux_boolean) | The boolean keeps its value. |
| [`timezone`](/modules/timezone) | The time zone stays. |
| [`wait_for`](/modules/wait_for) | Nothing happens. |

Handlers don't take `on_remove` either. Removing a handler changes nothing on the host.

## Stop managing a step without touching the host

To stop managing a step and leave the host exactly as it is, whatever its `on_remove` says, remove it from state instead of destroying it. Delete the step from the circuit and add a `removed` block:

```hcl
removed {
  from = conn3x_file.web__old_site

  lifecycle {
    destroy = false
  }
}
```

The next plan shows each instance as removed from state but not destroyed. You can delete the `removed` block after applying. `conn3x state rm` does the same from the command line. See [Resource addresses](/reference/circuits/addresses#state-commands).
