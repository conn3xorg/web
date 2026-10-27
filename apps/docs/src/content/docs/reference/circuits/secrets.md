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

## Connection secrets

The `ssh` block has no argument for an inline private key or sudo password. `private_key_file` and `become_password_file` take paths, and only the paths are stored in state. See [The ssh block](/reference/circuits/ssh).
