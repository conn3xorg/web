---
title: Secrets
description: Keep secrets out of state and plans with content_wo, write_only templates, ephemeral variables and the HMAC key.
---

A step's arguments are stored in state and shown in plans, like any resource's. For a password, a key or a token, use the write-only form of the file modules, and pass the value in through an ephemeral variable. This page summarizes the language side. [Secrets in files](/concepts#secrets-in-files) explains how it works and how to manage the key.

```hcl
variable "db_password" {
  type      = string
  ephemeral = true
}

circuit "db" {
  hosts = {
    db1 = "10.0.0.5"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "password" {
    file {
      path       = "/etc/app/db-password"
      content_wo = var.db_password
      owner      = "app"
    }
  }
}
```

## Write-only arguments

| Module | Argument | Effect |
| --- | --- | --- |
| [`file`](/modules/file) | `content_wo` | Use instead of `content`. The content goes to the host but not into the plan or state. |
| [`template`](/modules/template) | `write_only = true` | The rendered template goes to the host as `content_wo`. Use it when `vars` hold secrets. |
| [`windows_file`](/modules/windows_file) | `content_wo` | The same as `file`, for Windows hosts. |
| [`windows_powershell`](/modules/windows_powershell) | `args_wo` | Arguments for the script that stay out of the plan and state. |
| [`windows_registry_value`](/modules/windows_registry_value) | `data_wo` | Use instead of `data` for a secret value. |
| [`windows_user`](/modules/windows_user) | `password_wo` | The account's password. |
| [`windows_scheduled_task`](/modules/windows_scheduled_task) | `password_wo` | The password of the account the task runs as. |
| [`windows_ad_forest`](/modules/windows_ad_forest) | `safe_mode_password_wo` | The Directory Services Restore Mode password. |
| [`windows_domain_membership`](/modules/windows_domain_membership) | `password_wo` | The password of the account that joins the host to the domain. |
| [`windows_ad_domain_controller`](/modules/windows_ad_domain_controller) | `password_wo`, `safe_mode_password_wo` | The password of the account that promotes the host, and its Directory Services Restore Mode password. |
| [`windows_ad_user`](/modules/windows_ad_user) | `password_wo` | The user's password. A change plans as one `password_hmac` change. |

The `windows_*` modules are [experimental](/reference/maturity), so their arguments may change between releases.

`write_only` takes a literal `true` or `false`, not an expression, because Conn3x needs it before it evaluates anything.

A write-only file defaults to mode `0600` instead of `0644`. Its `content` and `sha256` attributes are null.

## content_hmac

Instead of the content, state records `content_hmac`: an HMAC-SHA256 of the file's path and content, in the form `hmac-sha256:KEY_ID:MAC`. When someone changes the file on the host, the next plan shows `content_hmac` changing, without showing either value, and apply writes your content back.

The key is never stored in state. Conn3x reads it from the `CONN3X_HMAC_KEY` environment variable, which must be at least 32 bytes long, or from `~/.config/conn3x/hmac.key` (under `$XDG_CONFIG_HOME` when that is set), which it creates the first time it needs one. Everything that runs `conn3x` against the same state needs the same key. For how to share it, and what to do if it is lost, see [Secrets in files](/concepts#secrets-in-files).

The key file should be readable only by you. If your group or other users can read it, plans of `content_wo` files and refreshes of their steps warn once per run and print the `chmod 600` command that fixes it. A key in `CONN3X_HMAC_KEY` isn't checked.

## Ephemeral variables

Declare a variable that holds a secret with `ephemeral = true`, and pass its value at run time with `-var` or a `TF_VAR_` environment variable. OpenTofu then keeps the value out of plan files and state. See OpenTofu's [ephemeral variables](https://opentofu.org/docs/language/values/variables/).

An ephemeral value can only go into a write-only argument. Using one in `content`, or in a template without `write_only = true`, is an error.

```hcl
variable "db_password" {
  type      = string
  ephemeral = true
}

circuit "db" {
  hosts = {
    db1 = "10.0.0.5"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "pgpass" {
    template {
      source      = "${path.module}/pgpass.tftpl"
      destination = "/root/.pgpass"
      vars        = { password = var.db_password }
      write_only  = true
    }
  }
}
```

A secret written into the configuration, as a literal or a variable's `default`, is part of the configuration, so it ends up in saved plan files even with `content_wo`.

## SOPS files

Want your secrets in the repository, next to the circuits, the way Ansible Vault kept them? Encrypt them with [SOPS](https://getsops.io) and age, and read them with the `conn3x_secrets` ephemeral resource. New in v0.16.0.

```hcl
terraform {
  required_providers {
    conn3x = { source = "terraform.io/builtin/conn3x" }
  }
}

ephemeral "conn3x_secrets" "app" {
  file = "${path.module}/secrets.sops.yaml"
}

circuit "app" {
  hosts = var.hosts
  ssh {
    user   = "deploy"
    become = true
  }

  step "db_password" {
    file {
      path       = "/etc/app/db_password"
      content_wo = ephemeral.conn3x_secrets.app.values["db_password"]
      mode       = "0600"
    }
  }
}
```

`values` is a map of the file's values: top-level keys as written, nested ones joined with dots, such as `db.password`, and list items by index, such as `hosts.0`. Because the resource is ephemeral, its values never reach state or a plan file, and OpenTofu stops you using one anywhere that would keep it. They go into write-only arguments such as `content_wo`, into ephemeral variables, and into the provider block's [`private_keys`](/reference/circuits/ssh#keys-from-a-secret-store).

**Keys.** Conn3x finds your age key where sops does: `SOPS_AGE_KEY`, the file `SOPS_AGE_KEY_FILE` names, or `sops/age/keys.txt` in your config directory. In CI, put the key in the pipeline's secret store as `SOPS_AGE_KEY`. To share the file with a teammate, add their age public key to `.sops.yaml` and run `sops updatekeys`. That's sops's own workflow, and Conn3x doesn't change it.

**Checking.** Conn3x checks the file's MAC as sops does, so a value edited without the key, or moved to another key, stops the plan.

**What it doesn't read yet:** recipients other than age, such as cloud KMS or PGP, and files that choose what to encrypt by comment, with `encrypted_comment_regex`. Writing and re-keying files is sops's job.

**From Ansible Vault.** `conn3x convert ansible` leaves each vaulted value as a TODO that says how to move it:

```sh
ansible-vault view group_vars/all/vault.yml \
  | sops -e --input-type yaml --output-type yaml --age <recipient> /dev/stdin \
  > secrets.sops.yaml
```

## Connection secrets

The `ssh` block has no argument for an inline private key or sudo password. `private_key_file` and `become_password_file` take paths, and only the paths are stored in state. See [The ssh block](/reference/circuits/ssh). Since v0.16.0, keys can also come from a secret store through the provider block: see [Keys from a secret store](/reference/circuits/ssh#keys-from-a-secret-store).
