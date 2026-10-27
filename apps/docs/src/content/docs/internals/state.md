---
title: State layout for host steps
description: The resource a step becomes, its instance keys, the attributes each instance stores, its id, and what write-only content leaves in state.
---

Conn3x has no state format of its own for hosts. Each step in a circuit becomes an ordinary managed resource of the built-in `conn3x` provider, and its instances are stored in the state file like any other resource's. `conn3x state list`, `conn3x state show` and the other [state commands](/reference/cli/state) work on them unchanged.

## The resource a step becomes

A step `STEP` in circuit `CIRCUIT` becomes the resource `conn3x_MODULE.CIRCUIT__STEP`. The two names are joined by two underscores, which is why a circuit name can't contain `__`. `MODULE` is the step's module block, except that a `template` step becomes `conn3x_file` and a `ufw` step becomes `conn3x_ufw_rule`.

The resource gets:

- the module block's arguments, as its own arguments;
- a `for_each` over the circuit's `hosts`;
- an `ssh` block built from the circuit's `ssh` block and the host's entry in `hosts`;
- a dependency on the step before it, plus anything in the step's `depends_on`.

For this circuit:

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
    web2 = { address = "203.0.113.11", port = 2222 }
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "motd" {
    file {
      path    = "/etc/motd"
      content = "Managed by Conn3x\n"
    }
  }
}
```

the step is stored as `conn3x_file.web__motd`, with the instances `conn3x_file.web__motd["web1"]` and `conn3x_file.web__motd["web2"]`. [Resource addresses](/reference/circuits/addresses) lists the address of every kind of instance.

## Instance keys

The instance key is the host's key in `hosts`, such as `"web1"`. It isn't the address, so you can change a host's address without changing its key. Changing the address does replace the host's steps; see [Moving a host to another address or port](/reference/circuits/ssh#moving-a-host-to-another-address-or-port).

A step with its own `for_each` has one instance for each host and item, keyed `"HOST/ITEM"`, such as `conn3x_package.web__tools["web1/git"]`. See [for_each](/reference/circuits/steps) for how items get their keys.

Renaming a host, a step or a circuit changes the instance's address. Use a `moved` block to keep the instance, as described in [Renaming](/reference/circuits/addresses#renaming).

## What an instance stores

Each instance stores the full set of the resource's attributes:

| Attribute | What it holds |
| --- | --- |
| `id` | An identifier for what the step manages on the host. See [The id attribute](#the-id-attribute). |
| `revision` | A random string that changes each time Conn3x changes something on the host for this instance. See [Revision and handlers](/internals/revision-and-handlers). |
| The module's arguments | The values from your configuration, with defaults filled in. A `file` step stores `mode = "0644"` and `on_remove = "forget"` when you set neither. |
| The module's computed attributes | Values Conn3x works out or reads from the host, such as a file's `sha256`, or a command's `stdout` and `satisfied`. Each [module page](/modules/file) lists them. |
| `ssh` | The `ssh` block this instance used. See below. |

After an apply, they describe what the apply left on the host. After a refresh, they describe what the refresh found there.

### The ssh block in state

Each instance stores its own copy of the `ssh` settings, already merged for its host:

- `host` is the address from `hosts`: the string itself, or the `address` field of a host object.
- `user`, `port`, `private_key_file`, `host_key` and `jump_hosts` come from the host object when it sets them, and from the circuit's `ssh` block otherwise.
- The rest come from the circuit's `ssh` block.

Settings that you leave unset are stored as null, not as their defaults. A host on port 22 that doesn't set `port` stores `port = null`.

What's stored is what you wrote, not what it resolves to. `private_key_file` and `become_password_file` are stored as paths; the key and the password are never read into state. With `ssh_config_file`, the file's path is stored, and the `HostName`, `User` and other values in it are looked up again each time Conn3x connects.

A refresh connects with these stored settings, and a removal uses them to reach the host. An apply uses the settings in your configuration. See [Where the ssh settings are stored](/reference/circuits/ssh#where-the-ssh-settings-are-stored).

## The id attribute

The `id` names the thing on the host. It starts with the host's address, followed by the port when the port is set and isn't 22, then a part that depends on the module:

| Step | id |
| --- | --- |
| `file` | `203.0.113.10:/etc/motd` |
| `file`, on port 2222 | `203.0.113.11:2222:/etc/motd` |
| `package` | `203.0.113.10:package:nginx` |
| `service` | `203.0.113.10:service:nginx.service` |
| `command` | `203.0.113.10:command` |
| A handler | `203.0.113.10:service-action:nginx.service` |

The id is for reading. Conn3x doesn't use it to find anything: the instance's own arguments say what to read. Ids recorded before the port was added keep their old form, so upgrading Conn3x doesn't plan a change to them.

## Write-only content

A `file` step with `content_wo`, or a `template` step with `write_only = true`, sends its content to the host without storing it. In that instance:

- `content_wo` is null, as for every write-only argument.
- `content` and `sha256` are null.
- `content_hmac` holds `hmac-sha256:KEY_ID:MAC`, an HMAC-SHA256 of the file's path and content.
- `mode` defaults to `"0600"`.

The HMAC key isn't stored. Conn3x reads it from `CONN3X_HMAC_KEY` or `~/.config/conn3x/hmac.key`. `KEY_ID` is the first 4 bytes of the key's SHA-256, in hex, so Conn3x can tell when state was written with a different key without revealing the key. A refresh computes the HMAC of the file it reads, so a changed file shows as a changed `content_hmac`, and the plan writes your content back.

Because the path is part of the HMAC, the same secret in two files gives two different values in state. For how to share and rotate the key, see [Secrets](/reference/circuits/secrets).

## Related

- [How plan reads hosts](/internals/plan-reads) describes the refresh that rewrites these attributes.
- [conn3x state](/reference/cli/state) lists the commands that read and change state.
