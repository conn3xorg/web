---
title: Expressions and functions
description: The expressions and functions circuits inherit from OpenTofu, and the names that only exist inside a circuit.
---

Circuits use OpenTofu's expression language and built-in functions, unchanged. Conn3x v0.6.2 is built on OpenTofu 1.13.2, so OpenTofu's [expressions](https://opentofu.org/docs/language/expressions/) and [functions](https://opentofu.org/docs/language/functions/) documentation applies to every argument in a circuit.

## What circuits inherit

Every argument in a circuit takes an expression, including `hosts`, every argument of the `ssh` block, every module argument and `for_each`. These all work as they do in a resource:

- [Types and values](https://opentofu.org/docs/language/expressions/types/): strings, numbers, bools, lists, sets, maps and objects.
- [Strings and templates](https://opentofu.org/docs/language/expressions/strings/): interpolation with `${...}`, directives with `%{...}`, and heredocs.
- [References to values](https://opentofu.org/docs/language/expressions/references/): `var.NAME`, `local.NAME`, resource and data source attributes, `module.NAME` outputs, `path.module`, `path.root` and `terraform.workspace`.
- [Operators](https://opentofu.org/docs/language/expressions/operators/), [conditional expressions](https://opentofu.org/docs/language/expressions/conditionals/), [`for` expressions](https://opentofu.org/docs/language/expressions/for/) and [splat expressions](https://opentofu.org/docs/language/expressions/splat/).
- [Function calls](https://opentofu.org/docs/language/expressions/function-calls/) to any built-in function, such as `file`, `templatefile`, `merge`, `try` and `yamlencode`.

```hcl
variable "environment" {
  type    = string
  default = "staging"
}

locals {
  web_hosts = {
    web1 = "203.0.113.10"
    web2 = "203.0.113.11"
  }
}

circuit "web" {
  hosts = local.web_hosts

  ssh {
    user   = "deploy"
    become = true
  }

  step "env" {
    file {
      path    = "/etc/app/environment"
      content = "${upper(var.environment)}\n"
      mode    = var.environment == "production" ? "0600" : "0644"
    }
  }

  step "hosts_file" {
    file {
      path    = "/etc/app/peers"
      content = join("\n", [for name, address in local.web_hosts : "${address} ${name}"])
    }
  }
}
```

## Names that only exist in a circuit

| Name | Where | Value |
| --- | --- | --- |
| `each.key` | Module blocks, the `ssh` block, handlers | The host's name: its key in `hosts`. |
| `each.value` | Module blocks, the `ssh` block, handlers | The host's entry in `hosts`: an address, or a host object. |
| `item.key` | Module blocks of a step with `for_each` | The current item's key. |
| `item.value` | Module blocks of a step with `for_each` | The current item's value. |
| `handler.NAME` | A step's `notify` | A handler in the same circuit. `handler` can't be used anywhere else. |

`each` and `item` aren't available in `hosts` or in a step's `for_each`. In the `ssh` block, `each` means the host in every step, a step with `for_each` included; see [The ssh block](/reference/circuits/ssh#each-in-the-ssh-block).

`count.index` and `self` aren't available in a circuit.

## Static arguments

A few arguments take references or literals rather than general expressions:

| Argument | Takes |
| --- | --- |
| `depends_on` | A list of resource or module addresses. |
| `notify` | A list of `handler.NAME` references. |
| `write_only`, in a `template` step | A literal `true` or `false`. |

## Functions

Every OpenTofu 1.13.2 built-in function is available. The `conn3x` provider has no functions of its own. To list the functions with their signatures, run:

```sh
conn3x metadata functions -json
```

Two functions are especially common in circuits:

- [`file`](https://opentofu.org/docs/language/functions/file/) reads a file next to the configuration into a `file` step's `content`, as in `file("${path.module}/nginx.conf")`.
- [`templatefile`](https://opentofu.org/docs/language/functions/templatefile/) renders a template. A [`template`](/modules/template) step is a `file` step whose content is `templatefile(source, vars)`.

Both run on the machine that runs `conn3x`, not on the host.

## Ephemeral values

An [ephemeral variable](https://opentofu.org/docs/language/values/variables/) can only be used in a write-only argument: a `file` step's `content_wo`, or a `template` step with `write_only = true`. See [Secrets](/reference/circuits/secrets).

## Host facts

To make an expression depend on a host's operating system, architecture or memory, read them at plan time with the [`conn3x_host`](/reference/host-facts) data source.
