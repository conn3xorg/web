---
title: Adopt servers you already run
description: "Bring a server that was set up by hand, or by another tool, under Conn3x without recreating anything: import = true on a step, what the first plan shows, and the hosts that don't have the object yet."
---

:::note
Steps take `import` since v0.8.0. Earlier releases reject it with "Unsupported argument in step".
:::

You've got a box that's been running for two years. nginx is on it, there's a `deploy` user, and someone wrote a motd once. You'd like Conn3x to manage it from now on, but you don't want the first apply to treat a working server like an empty one.

Add `import = true` to each step that describes something already there. The first plan then reads the host, records what it finds, and shows you only where the host and your circuit disagree.

## Write the circuit as the server should be

Here's the [try-it-locally](/tutorials/try-locally) circuit, pointed at a container where nginx, the user and the motd were set up by hand:

```hcl
circuit "try" {
  hosts = { box = "127.0.0.1" }

  ssh {
    port             = 2222
    user             = "root"
    private_key_file = "./id_ed25519"
    known_hosts_file = "./known_hosts"
  }

  step "nginx" {
    import = true
    package {
      name = "nginx"
    }
  }

  step "nginx_running" {
    import = true
    service {
      name    = "nginx"
      state   = "started"
      enabled = true
    }
  }

  step "deploy" {
    import = true
    user {
      name  = "deploy"
      shell = "/bin/bash"
    }
  }

  step "motd" {
    import = true
    file {
      path    = "/etc/motd"
      content = "Managed by Conn3x\n"
    }
  }
}
```

Write each step the way you want the server to end up, not the way it is. The plan tells you the difference.

## Read the first plan

```text
$ conn3x plan
...
Conn3x will perform the following actions:

  # conn3x_file.try__motd["box"] will be updated in-place
  # (imported from "{"args":{"path":"/etc/motd"},"key":"box","ssh":{"host":"127.0.0.1","known_hosts_file":"./known_hosts","port":2222,"private_key_file":"./id_ed25519","user":"root"},"v":1}")
  ~ resource "conn3x_file" "try__motd" {
      ~ content    = <<-EOT
          - Welcome
          + Managed by Conn3x
        EOT
        id         = "127.0.0.1:2222:/etc/motd"
        mode       = "0644"
        ...
    }

  # conn3x_package.try__nginx["box"] will be imported
  ...
  # conn3x_service.try__nginx_running["box"] will be imported
  ...
  # conn3x_user.try__deploy["box"] will be imported
  ...

Plan: 4 to import, 0 to add, 1 to change, 0 to destroy.
```

Three steps say `will be imported` and nothing else: the host already matches, so apply only records them. The motd is different, so it's imported and then updated, and you see the diff before anything is written. Nothing on the host has changed yet.

The `imported from` line is the ID Conn3x builds for the import. It carries the step's ssh settings, so it names your key file and known_hosts paths, never the key itself. It shows only on the plan that imports.

Want to adopt everything exactly as it is first, and change things later? Add `lifecycle { ignore_changes = all }` to the step for the first apply, then take it out.

## Apply, then plan again

```text
$ conn3x apply
...
Apply complete! Resources: 4 imported, 0 added, 1 changed, 0 destroyed.

$ conn3x plan
...
No changes. Your infrastructure matches the configuration.
```

From here the server is managed like any other. Change an argument and the plan shows that one change:

```text
  # conn3x_file.try__motd["box"] will be updated in-place
  ~ resource "conn3x_file" "try__motd" {
        id         = "127.0.0.1:2222:/etc/motd"
      ~ mode       = "0644" -> "0640"
        ...
    }

Plan: 0 to add, 1 to change, 0 to destroy.
```

You can leave `import = true` in place. Once a step is in state, its import does nothing.

## Hosts that don't have it yet

An import says the object is already there. When it isn't, Conn3x stops the plan instead of quietly creating it:

```text
$ conn3x plan
Error: Nothing to import on box

The step imports file /etc/app.conf on box, but box doesn't have it, so
there's nothing to adopt. Remove box from the step's import, or set import to
the hosts that already have it; Conn3x then creates it on the rest.
```

That matters most when you add a host later. Under `import = true`, a new `web3` would be imported, not set up, and fail here. So when only some hosts have the object, list them:

```hcl
step "motd" {
  import = ["web1", "web2"]
  file {
    path    = "/etc/motd"
    content = "Managed by Conn3x\n"
  }
}
```

`web1` and `web2` are adopted; every other host gets a fresh motd. A name that isn't in `hosts` is an error, so a typo can't turn an adopt into a create. In a step with [`for_each`](/reference/circuits/steps#for_each), a host name covers all of that host's items.

## Secrets stay out of state

A file whose content is a secret goes in `content_wo`, or a [template](/modules/template) with `write_only = true`. Importing it records an HMAC of what's on the host, never the content, so the secret doesn't reach state or the plan.

## What can be adopted

`file`, `template`, `directory`, `link`, `package`, `service`, `user` and `group`, on Linux. Since v0.9.0, `authorized_key`, `cron`, `timer`, `sysctl`, `mount`, `repository`, `hostname`, `timezone`, `locale`, `firewalld`, `ufw`, `selinux_boolean` and `selinux_fcontext` can be adopted too. Since v0.10.0, so can `windows_file`, `windows_directory`, `windows_service`, `windows_registry_value`, `windows_feature`, `windows_user` and `windows_group`, since v0.11.0 `windows_package`, `postgresql_database`, `postgresql_role`, `mysql_database` and `mysql_user`, and since v0.15.0 `windows_firewall_rule`, `windows_scheduled_task`, `windows_iis_app_pool`, `windows_iis_site`, `windows_acl`, `windows_dns_client`, `windows_ad_ou`, `windows_ad_group` and `windows_ad_user`. Every host already has a hostname, a time zone and a locale, so those three never stop the plan with "Nothing to import": if the host's differs from your step, it's imported and the plan shows the change. Other modules reject `import` for now. Steps that edit part of a file (`line`, `block`, `ini`, `replace`) don't need it: they already work with whatever is there.

Most of these modules default to `on_remove = "forget"`, so removing an adopted step later leaves the object on the host. Five don't: `authorized_key`, `cron`, `timer`, `firewalld` and `ufw` default to `"delete"`, adopted or not. Removing one of those steps deletes the key, the cron file, the timer or the firewall rule, even though Conn3x didn't create it. If you'd rather keep them, set `on_remove = "forget"` on the step before you adopt. See [Removal](/reference/circuits/removal).

A step's own `import` works in your root configuration. To adopt what a [shared circuit](/guides/share-a-circuit) called as a module manages, since v0.9.0 you can write an `import` block in your root configuration with [`provider::conn3x::import_id`](/reference/circuits/steps#a-step-inside-a-module).

Writing each step by hand is the slow part. Since v0.9.0, [`conn3x generate step`](/reference/cli/generate-step) reads one object on a host and prints its step, with `import = true` already in it.

Adopt hosts that already exist, not ones the same apply creates. Conn3x builds the import from the step's arguments and its `ssh` settings when it plans, so every one of them has to be known then. If a step points at a server that this plan is still going to create, its address is only known after apply, and the plan stops with an error about an import ID that isn't known yet. Adopt first, against servers that are already running, and add new servers in a later apply.
