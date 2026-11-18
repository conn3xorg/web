---
title: Secrets from a secret manager
description: Read a password from OpenBao, Vault, AWS Secrets Manager or Azure Key Vault at run time and write it to your hosts, without it reaching the plan or state.
---

Your database password already lives in a secret manager. You want it on the app servers, in a file only root can read, and nowhere else: not in Git, not in a saved plan, not in state where anyone with read access to the bucket can see it.

Two pieces do that. An **ephemeral resource** reads the secret when Conn3x plans and applies, and forgets it after. A **write-only argument**, such as a `file` step's `content_wo`, sends it to the host without recording it. State keeps only an HMAC of the content, so drift on the host still shows up. [Secrets](/reference/circuits/secrets) covers both in full; this page is the recipe for each manager.

Each recipe below was run for real: the secret was read from the manager, written to a host, and then searched for in the saved plan file and in state. It wasn't in either.

## OpenBao or Vault

OpenBao speaks Vault's API, so the `hashicorp/vault` provider works with both. Its `vault_kv_secret_v2` ephemeral resource reads a KV v2 secret:

```hcl
terraform {
  required_providers {
    vault = { source = "hashicorp/vault" }
  }
}

provider "vault" {
  address = "https://bao.example.com:8200" # the token comes from VAULT_TOKEN
}

ephemeral "vault_kv_secret_v2" "app" {
  mount = "secret"
  name  = "app"
}

circuit "app" {
  hosts = { app1 = "10.0.0.5" }

  ssh {
    user   = "deploy"
    become = true
  }

  step "db_password" {
    file {
      path       = "/etc/app/db-password"
      content_wo = ephemeral.vault_kv_secret_v2.app.data["db_password"]
      owner      = "app"
    }
  }
}
```

`name` is the secret's path under the mount, without `data/`: the secret written with `bao kv put secret/app db_password=...` is `mount = "secret"`, `name = "app"`. Give Conn3x a token that can read only what it needs, through `VAULT_TOKEN` or any of the provider's auth methods. It's never stored either.

This one was run against OpenBao 2.7 in dev mode.

## AWS Secrets Manager

The `aws_secretsmanager_secret_version` ephemeral resource reads the current version. A secret stored as JSON key/value pairs, as the console makes them, comes back as one string, so decode it:

```hcl
ephemeral "aws_secretsmanager_secret_version" "app" {
  secret_id = "prod/app"
}

locals {
  app = jsondecode(ephemeral.aws_secretsmanager_secret_version.app.secret_string)
}

circuit "app" {
  # hosts and ssh as above

  step "db_password" {
    file {
      path       = "/etc/app/db-password"
      content_wo = local.app.db_password
      owner      = "app"
    }
  }
}
```

A local built from an ephemeral value is ephemeral too, so `local.app` stays out of the plan as well. The identity Conn3x runs as needs `secretsmanager:GetSecretValue` on the secret, and `kms:Decrypt` if it's encrypted with your own KMS key.

## Azure Key Vault

The `azurerm` provider's `azurerm_key_vault_secret` ephemeral resource reads a secret's current version. It needs the vault's ID, which the data source finds by name:

```hcl
terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm" }
  }
}

provider "azurerm" {
  features {}
  subscription_id = "00000000-0000-0000-0000-000000000000"
}

data "azurerm_key_vault" "app" {
  name                = "app-vault"
  resource_group_name = "app"
}

ephemeral "azurerm_key_vault_secret" "db_password" {
  name         = "app-db-password"
  key_vault_id = data.azurerm_key_vault.app.id
}

circuit "app" {
  # hosts and ssh as above

  step "db_password" {
    file {
      path       = "/etc/app/db-password"
      content_wo = ephemeral.azurerm_key_vault_secret.db_password.value
      owner      = "app"
    }
  }
}
```

The vault has to be in the provider's subscription; for one in another, give that subscription an aliased provider. With Azure RBAC on the vault, the identity Conn3x runs as needs **Key Vault Secrets User** on it, which reads secret values and nothing else. With access policies, it needs the Get permission on secrets. Key Vault strips newlines from a secret, so store a multi-line one base64-encoded and write it with `base64decode()`.

This one was run with `azurerm` 4.x against a vault in West US 2.

## What the plan shows

The plan says a write-only value is going to the host, and nothing more:

```text
  + resource "conn3x_file" "app__db_password" {
      + content_hmac = "hmac-sha256:f8b415cc:deb7e6a6edc5..."
      + content_wo   = (write-only attribute)
      + mode         = "0600"
      + path         = "/etc/app/db-password"
    }
```

The file gets mode `0600` unless you set one. When the password is rotated in the manager, the next plan shows `content_hmac` changing, and apply writes the new one. If someone edits the file on the host, the same thing happens.

## Before you run it

- **Every machine that plans needs the same HMAC key.** Conn3x reads it from `CONN3X_HMAC_KEY` or `~/.config/conn3x/hmac.key`. A CI runner with a different key sees every write-only file as changed. See [Secrets in files](/concepts#secrets-in-files).
- **The manager is read on plan and again on apply.** Both need network access to it and permission to read the secret.
- **Use the secret only in write-only arguments.** An ephemeral value in `content`, or in a template without `write_only = true`, is an error, which is the point: it can't leak by accident.
