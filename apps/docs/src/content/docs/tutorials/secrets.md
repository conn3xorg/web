---
title: Keep secrets out of state
description: Write a password to a host with content_wo and a write-only template, pass it in through an ephemeral variable, and see what state keeps instead.
---

In this tutorial you'll put a database password on a host without it appearing in the plan, the state file or a saved plan. You'll pass it in through an ephemeral variable, write it with `content_wo` and a write-only template, and look at the HMAC that state keeps instead. Then you'll change the file by hand and see how Conn3x notices without showing either value.

**Time:** 10 minutes.

## Prerequisites

- Conn3x v0.6.2 [installed](/install).
- The container from [Try Conn3x locally](/tutorials/try-locally), running. If you've removed it, start it again from `conn3x/examples/try-it-locally` with `./up.sh`.

## The configuration

The example is in the same repository, next to `try-it-locally`. From the `try-it-locally` directory:

```sh
cd ../secrets
```

`main.circuit.hcl` declares the password as a variable and writes it twice:

```hcl
variable "db_password" {
  type      = string
  ephemeral = true
}

circuit "db" {
  hosts = { box = "127.0.0.1" }

  ssh {
    port             = 2222
    user             = "root"
    private_key_file = "../try-it-locally/id_ed25519"
    known_hosts_file = "../try-it-locally/known_hosts"
  }

  step "password" {
    file {
      path       = "/root/db-password"
      content_wo = var.db_password
    }
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

`pgpass.tftpl` is a one-line template:

```text
localhost:5432:*:app:${password}
```

Three settings keep the password out:

- **`ephemeral = true`** on the variable. OpenTofu keeps an ephemeral value out of state and saved plan files, and only lets it go into write-only arguments.
- **`content_wo`** on the `file` step, in place of `content`. The content goes to the host but isn't recorded.
- **`write_only = true`** on the `template` step. The rendered template is sent as `content_wo`.

The variable has no `default`. A default, or a literal password in the file, is part of the configuration, and ends up in saved plan files even with `content_wo`.

## Pass the password in

Set the variable in the environment, so it isn't written to a file:

```sh
export TF_VAR_db_password='correct-horse-battery-staple'
```

Without it, Conn3x asks for the value, or stops with `No value for required variable` when it can't prompt, as with `-input=false`.

## Plan

```sh
conn3x init
conn3x plan
```

```text
  # conn3x_file.db__password["box"] will be created
  + resource "conn3x_file" "db__password" {
      + content_hmac = "hmac-sha256:11bbc104:9efb1462192d4b074c1b2bead3c85efc3f22423d1762866de0b99f3f6ac8a98a"
      + content_wo   = (write-only attribute)
      + id           = "127.0.0.1:2222:/root/db-password"
      + mode         = "0600"
      + on_remove    = "forget"
      + path         = "/root/db-password"
      + revision     = (known after apply)
```

There's no `content`. Instead the plan shows `content_hmac`, an HMAC-SHA256 of the file's path and content. `11bbc104` identifies the key it was made with. Your key, and so your HMAC, will differ. The mode defaults to `0600` for write-only files.

## Apply

```sh
conn3x apply
```

Type `yes`:

```text
conn3x_file.db__password["box"]: Creating...
conn3x_file.db__password["box"]: Creation complete after 2s [id=127.0.0.1:2222:/root/db-password]
conn3x_file.db__pgpass["box"]: Creating...
conn3x_file.db__pgpass["box"]: Creation complete after 1s [id=127.0.0.1:2222:/root/.pgpass]

Apply complete! Resources: 2 added, 0 changed, 0 destroyed.
```

The password is on the host:

```sh
ssh -p 2222 -i ../try-it-locally/id_ed25519 -o UserKnownHostsFile=../try-it-locally/known_hosts root@127.0.0.1 cat /root/.pgpass
```

```text
localhost:5432:*:app:correct-horse-battery-staple
```

And it isn't in state:

```sh
grep -c correct-horse terraform.tfstate
grep content_hmac terraform.tfstate
```

```text
0
            "content_hmac": "hmac-sha256:11bbc104:9efb1462192d4b074c1b2bead3c85efc3f22423d1762866de0b99f3f6ac8a98a",
            "content_hmac": "hmac-sha256:11bbc104:ca090d602fa814c9cd8d450237562cae976d530a153f88633faaec46838ee428",
```

## Change the file by hand

Overwrite the password on the host:

```sh
ssh -p 2222 -i ../try-it-locally/id_ed25519 -o UserKnownHostsFile=../try-it-locally/known_hosts root@127.0.0.1 'echo hunter2 > /root/db-password'
conn3x plan
```

```text
  # conn3x_file.db__password["box"] will be updated in-place
  ~ resource "conn3x_file" "db__password" {
      ~ content_hmac = "hmac-sha256:11bbc104:4034c4defbb122ac7ca4a301b528cc73423776ec854822711d5dab084ed45452" -> "hmac-sha256:11bbc104:9efb1462192d4b074c1b2bead3c85efc3f22423d1762866de0b99f3f6ac8a98a"
      ~ content_wo   = (write-only attribute)
        id           = "127.0.0.1:2222:/root/db-password"
      ~ revision     = "2ff8a412f4e0a982" -> (known after apply)
        # (3 unchanged attributes hidden)

        # (1 unchanged block hidden)
    }

Plan: 0 to add, 1 to change, 0 to destroy.
```

Conn3x read the file, computed the HMAC of what it found, and compared it with the HMAC of your password. They differ, so the plan writes the file back, without printing either value. `conn3x drift` reports the same file as `changed`. Run `conn3x apply` to put the password back.

## The HMAC key

The HMAC needs a key, and the key is never stored in state. The first time Conn3x writes a write-only file, it creates `~/.config/conn3x/hmac.key` (under `$XDG_CONFIG_HOME` if that's set). You can also set the key in `CONN3X_HMAC_KEY`, for example in CI:

```sh
openssl rand -hex 32
```

Everything that runs `conn3x` against this state needs the same key. With a different one, Conn3x stops and tells you which key the state expects. The message gives the full path of your key file:

```text
Error: Invalid content_wo

  with conn3x_file.db__password["box"],
  on main.circuit.hcl line 22, in circuit "db":
  22:       content_wo = var.db_password

this state's write-only content was hashed with key 11bbc104, but the key
here is ddf12289. Use the same key everywhere you run Conn3x: set
CONN3X_HMAC_KEY, or copy
/home/you/.config/conn3x/hmac.key
from the machine that applied it. If that key is lost, run conn3x state rm on
this resource and apply again to rewrite the file with the key here
```

Copy the key file's content into `CONN3X_HMAC_KEY` wherever else you run Conn3x. [Secrets in files](/concepts#secrets-in-files) covers sharing and replacing the key.

## Ephemeral values only go to write-only arguments

An ephemeral value can't go into an ordinary argument. In a circuit that sets `content = var.db_password` instead of `content_wo`, `conn3x validate` fails:

```text
Error: Ephemeral value used in non-ephemeral context

  with conn3x_file.db__password,
  on main.circuit.hcl line 17, in circuit "db":
  17:       content = var.db_password

Attribute ".content" is referencing an ephemeral value but ephemeral values
can be referenced only by other ephemeral attributes or by write-only ones.
```

That's the guard that keeps the secret from slipping into state through a typo.

## Clean up

Remove the state and the provider cache from the `secrets` directory, then the container:

```sh
rm -rf .terraform .terraform.lock.hcl terraform.tfstate terraform.tfstate.backup
../try-it-locally/down.sh
unset TF_VAR_db_password
```

`down.sh` prints `Removed.`. The HMAC key stays in `~/.config/conn3x/hmac.key` for the next time. Delete it if you don't need it.

## Next steps

- [Catch drift in CI](/tutorials/drift-in-ci), which needs this key in CI if your state holds write-only content.
- [Secrets](/reference/circuits/secrets) in the circuit language reference.
- The [file](/modules/file) and [template](/modules/template) module pages.
