---
title: Circuit language
description: What a circuit is, which files circuits go in, and how Conn3x turns each step into a resource with one instance per host.
---

Conn3x configuration is OpenTofu configuration with one more block type, `circuit`. A circuit configures a group of Linux hosts over SSH: it names the hosts, says how to log in to them, and lists the steps to apply to each one, in order.

This section documents the circuit language in Conn3x v0.6.0. Everything else in a configuration, such as variables, resources, modules, outputs and state, works as the [OpenTofu language documentation](https://opentofu.org/docs/language/) describes.

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
    web2 = "203.0.113.11"
  }

  ssh {
    user   = "deploy"
    become = true
  }

  step "nginx" {
    package {
      name = "nginx"
    }
  }

  step "config" {
    file {
      path    = "/etc/nginx/conf.d/site.conf"
      content = "server { listen 80; server_name ${each.key}.example.com; }\n"
    }
    notify = [handler.reload]
  }

  step "running" {
    service {
      name    = "nginx"
      state   = "started"
      enabled = true
    }
  }

  handler "reload" {
    service {
      name   = "nginx"
      action = "reload"
    }
  }
}
```

## Syntax

```text
circuit "NAME" {
  hosts = EXPRESSION

  ssh {
    ARGUMENT = EXPRESSION
    ...
  }

  step "NAME" {
    MODULE {
      ARGUMENT = EXPRESSION
      ...
    }
  }

  handler "NAME" {
    service {
      name = EXPRESSION
    }
  }
}
```

A circuit block takes one label, the circuit's name, and these arguments and blocks:

| Name | Required | Description |
| --- | --- | --- |
| `hosts` | Yes | The hosts to configure. A map of host names to addresses or host objects, or a set of addresses. See [Hosts](/reference/circuits/hosts). |
| `ssh` | Yes | Exactly one block. How to log in to every host. See [The ssh block](/reference/circuits/ssh). |
| `step` | No | Any number of blocks. Each holds one module and runs on every host, in the order written. See [Steps](/reference/circuits/steps). |
| `handler` | No | Any number of blocks. Each restarts or reloads a service on the hosts where a step that notifies it changed something. See [Handlers](/reference/circuits/handlers). |

A circuit with no steps is valid and does nothing.

## Names

Circuit, step and handler names must be valid identifiers: letters, digits, underscores and hyphens, not starting with a digit. They can't contain a double underscore (`__`), because Conn3x uses it to join circuit and step names.

Step names must be unique within a circuit, and so must handler names. Two circuits can use the same step and handler names. Circuit names must be unique within a module.

## Files

Circuits can go in two kinds of file:

- `.circuit.hcl` files. Conn3x reads them like `.tf` files, so a `.circuit.hcl` file can also hold variables, resources, outputs and any other block.
- `.tf` and `.tofu` files, next to your resources.

Use whichever suits the project. A common layout keeps the cloud in `main.tf` and the hosts in `web.circuit.hcl`. Circuits must be written in native HCL syntax. JSON configuration files (`.tf.json`) can't contain circuits.

Circuits can go in child modules as well as the root module. Their resources then have a `module.NAME.` prefix. See [Resource addresses](/reference/circuits/addresses).

## How a circuit becomes resources

Conn3x doesn't add a new kind of object to the plan. When it reads the configuration, it turns every step and every handler into an ordinary managed resource of its built-in `conn3x` provider:

| In the circuit | Resource |
| --- | --- |
| `step "NAME"` using module `MODULE` in circuit `CIRCUIT` | `conn3x_MODULE.CIRCUIT__NAME` |
| `step "NAME"` using `template` | `conn3x_file.CIRCUIT__NAME` |
| `step "NAME"` using `ufw` | `conn3x_ufw_rule.CIRCUIT__NAME` |
| `handler "NAME"` | `conn3x_service_action.CIRCUIT__NAME` |

Each resource has `for_each` set to the circuit's `hosts`, so it has one instance per host, keyed by the host's name. A step with its own [`for_each`](/reference/circuits/steps#for_each) has one instance per host and item instead, keyed `"HOST/ITEM"`.

Each instance gets the circuit's `ssh` block, with the host's address filled in. Each step depends on the step before it, and each handler depends on the last step and watches the steps that notify it.

For the circuit above, a plan shows these instances:

```text
conn3x_package.web__nginx["web1"]
conn3x_package.web__nginx["web2"]
conn3x_file.web__config["web1"]
conn3x_file.web__config["web2"]
conn3x_service.web__running["web1"]
conn3x_service.web__running["web2"]
conn3x_service_action.web__reload["web1"]
conn3x_service_action.web__reload["web2"]
```

Because steps are resources, everything that works with resources works with them: `plan` and `apply`, state, references from other resources and outputs, `-target`, `moved` and `removed` blocks, and the `state` commands. The names above are what you use for all of these.

## Validation warnings

`conn3x validate` and `conn3x plan` warn about two things in a circuit:

- A handler that no step notifies. It never runs, and Conn3x creates no resource for it.
- A file that one step writes whole, with `file` or `template`, while another step in the same circuit edits it with `line` or `block`. Each apply would undo the other. Put the edit in the file's content instead. Conn3x can only compare paths written as literal strings.

## In this section

- [Hosts](/reference/circuits/hosts): the `hosts` argument, host objects and instance keys.
- [The ssh block](/reference/circuits/ssh): every connection setting, jump hosts, host keys and sudo.
- [Steps](/reference/circuits/steps): ordering, dependencies and `for_each`.
- [Handlers](/reference/circuits/handlers): `notify`, when handlers run, and the `revision` attribute.
- [Removal](/reference/circuits/removal): what `on_remove` does for each module.
- [Secrets](/reference/circuits/secrets): write-only content and ephemeral variables.
- [Resource addresses](/reference/circuits/addresses): targeting steps and hosts, and using the state commands.
- [Expressions and functions](/reference/circuits/expressions): what circuits inherit from OpenTofu.
- [Host facts](/reference/host-facts): reading a host's operating system and hardware at plan time.
