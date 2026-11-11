---
title: Run a database for an app
description: Install MariaDB with a circuit, make the app's database and account, narrow its privileges later, and keep its password out of state.
---

An app needs a database, an account to reach it with, and a password nobody has to paste anywhere. This guide does all three with one circuit on one server, then comes back to take privileges away, which is the step people most often get wrong by hand.

It uses MariaDB, which Rocky Linux, Debian and Ubuntu all ship as `mariadb-server`. The same steps work against MySQL. The output below is from a run on Rocky Linux 10 and Ubuntu 24.04, trimmed.

## The circuit

```hcl
variable "app_password" {
  type      = string
  sensitive = true
  ephemeral = true
}

circuit "db" {
  hosts = { db1 = "203.0.113.20" }

  ssh {
    user   = "deploy"
    become = true
  }

  step "server" {
    package {
      name = "mariadb-server"
    }
  }

  step "running" {
    service {
      name    = "mariadb"
      state   = "started"
      enabled = true
    }
  }

  step "app_db" {
    mysql_database {
      name      = "app"
      charset   = "utf8mb4"
      collation = "utf8mb4_unicode_ci"
    }
  }

  step "app_user" {
    mysql_user {
      name        = "app"
      password_wo = var.app_password
      grants = {
        app = ["ALL PRIVILEGES"]
      }
    }
  }
}
```

The steps run in order, so the server is installed and running before the database is made, and the database exists before the account is granted anything on it. Conn3x runs the `mysql` client on the host as root, over the server's socket, so nothing on your machine needs a database driver or a route to port 3306. That's why `become = true` is set.

## The first apply

Pass the password at run time, from wherever you keep it:

```text
$ export TF_VAR_app_password="$(pass show db1/app)"
$ conn3x apply
...
Plan: 4 to add, 0 to change, 0 to destroy.
...
conn3x_package.db__server["db1"]: Creation complete after 10s [id=…]
conn3x_service.db__running["db1"]: Creation complete after 3s [id=…]
conn3x_mysql_database.db__app_db["db1"]: Creation complete after 0s [id=…]
conn3x_mysql_user.db__app_user["db1"]: Creation complete after 0s [id=…]

Apply complete! Resources: 4 added, 0 changed, 0 destroyed.
```

On the server, the account has everything on its own database, and nothing else:

```text
$ sudo mysql -e "SHOW GRANTS FOR app@localhost"
GRANT USAGE ON *.* TO `app`@`localhost` IDENTIFIED BY PASSWORD '*ABE8…'
GRANT ALL PRIVILEGES ON `app`.* TO `app`@`localhost`
```

The next plan reads the database and the account back from the server and finds nothing to do:

```text
$ conn3x plan
...
No changes. Your infrastructure matches the configuration.
```

## Where the password goes

`app_password` is an [ephemeral variable](/reference/circuits/secrets): OpenTofu keeps its value out of plan files and state. `password_wo` is write-only, so the step uses the value and doesn't keep it.

- **On the server:** the password goes to the `mysql` client on its stdin, inside the `CREATE USER` statement, never on a command line where `ps` would show it. The server stores its own hash of it, as it would for any account.
- **In state:** Conn3x keeps a keyed hash, `password_hmac`, so the next plan can tell whether you've given a new password. The key is `CONN3X_HMAC_KEY`, or `~/.config/conn3x/hmac.key`, which Conn3x makes the first time it needs one.

You don't have to take that on trust. Pull the state and look at the account:

```text
$ conn3x state pull | jq '.resources[] | select(.type == "conn3x_mysql_user") | .instances[0].attributes | {password_hmac, password_wo}'
{
  "password_hmac": "argon2id-hmac-sha256:bdaf1bb9:4991…",
  "password_wo": null
}
$ conn3x state pull | grep -c "$TF_VAR_app_password"
0
```

The password is set again whenever the value you pass changes, because its hash changes. A password someone changed on the server by hand doesn't show as drift: Conn3x can't read it back, only compare what you give it.

## Narrowing the privileges

The app has been running for a while, and it turns out it only reads and writes rows: it never creates or alters tables. Give it only what it uses:

```hcl
  step "app_user" {
    mysql_user {
      name        = "app"
      password_wo = var.app_password
      grants = {
        app = ["SELECT", "INSERT", "UPDATE", "DELETE"]
      }
    }
  }
```

`grants` is the whole list, not a list of additions. The plan shows `ALL PRIVILEGES` going and the four coming, and the account is updated in place, not made again:

```text
$ conn3x plan
...
  # conn3x_mysql_user.db__app_user["db1"] will be updated in-place
  ~ resource "conn3x_mysql_user" "db__app_user" {
      ~ grants        = {
          ~ "app" = [
              - "ALL PRIVILEGES",
              + "DELETE",
              + "INSERT",
              + "SELECT",
              + "UPDATE",
            ]
        }
        name          = "app"
        ...
    }

Plan: 0 to add, 1 to change, 0 to destroy.
```

After the apply, the server has exactly those four, and nothing left over from before:

```text
$ sudo mysql -e "SHOW GRANTS FOR app@localhost"
GRANT USAGE ON *.* TO `app`@`localhost` IDENTIFIED BY PASSWORD '*ABE8…'
GRANT SELECT, INSERT, UPDATE, DELETE ON `app`.* TO `app`@`localhost`

$ mysql -u app -p app -e "CREATE TABLE t (i int)"
ERROR 1142 (42000) at line 1: CREATE command denied to user 'app'@'localhost' for table `app`.`t`
```

Granting the narrower list by hand, with `GRANT SELECT, …`, would have left `ALL PRIVILEGES` in place, because a `GRANT` only ever adds. That's the mistake this step can't make: whatever isn't listed is revoked, and a database that isn't listed at all loses its grant.

Some things `grants` leaves alone: global privileges such as `PROCESS`, and grants on single tables. Leave `grants` unset altogether and Conn3x doesn't touch the account's privileges at all.

## Taking it down

Delete the steps and the plan lists them. By default, `on_remove = "forget"` leaves the database and the account on the server. Set `on_remove = "delete"` on a step before you remove it to drop the database, with everything in it, or the account. See the [`mysql_database`](/modules/mysql_database) and [`mysql_user`](/modules/mysql_user) pages for the details of each.

## PostgreSQL

[`postgresql_database`](/modules/postgresql_database) and [`postgresql_role`](/modules/postgresql_role) do the same for PostgreSQL. The role's password is turned into a SCRAM-SHA-256 verifier on your machine, so the plain text never reaches the server at all. Roles don't take grants yet: `attributes`, such as `CREATEDB`, is the whole list in the same way `grants` is here.
