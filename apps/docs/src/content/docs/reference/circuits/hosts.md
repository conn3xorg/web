---
title: Hosts
description: The hosts argument of a circuit, the forms it accepts, host objects and their fields, and how instance keys are formed.
---

The `hosts` argument says which hosts a circuit configures. It is required.

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
    web2 = "203.0.113.11"
  }

  ssh {
    user = "deploy"
  }
}
```

Conn3x uses `hosts` as the `for_each` of every resource the circuit creates, so it follows OpenTofu's rules for [`for_each`](https://opentofu.org/docs/language/meta-arguments/for_each/): it must be a map or a set of strings, and its keys must be known when Conn3x plans. Its values can be unknown until apply, such as the address of a server created in the same plan.

## Accepted forms

### A map of names to addresses

Each key is the host's name, and each value is the address Conn3x connects to: a hostname or an IP address.

```hcl
circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
    web2 = "web2.example.com"
  }

  ssh {
    user = "deploy"
  }
}
```

### A map of names to host objects

A value can be an object with an `address` and any of the connection settings listed in [Host object fields](#host-object-fields). These override the circuit's `ssh` block for that host. A map can mix addresses and objects.

```hcl
circuit "fleet" {
  hosts = {
    web1 = "10.0.0.4"
    db1  = { address = "10.0.0.5", user = "admin", port = 2222 }
  }

  ssh {
    user = "deploy"
  }
}
```

### A set of addresses

A set of strings uses each address as the host's name too. Wrap a list in `toset()`: a list or tuple is an error.

```hcl
circuit "web" {
  hosts = toset(["203.0.113.10", "203.0.113.11"])

  ssh {
    user = "deploy"
  }
}
```

### An expression

Any expression that produces one of these forms works: a variable, a local, a `for` expression over a resource, or a `merge()` of several maps. An inventory is an ordinary variable, and a group is a map you merge with another.

```hcl
variable "web_hosts" {
  type = map(string)
}

variable "db_hosts" {
  type = map(string)
}

circuit "monitoring" {
  hosts = merge(var.web_hosts, var.db_hosts)

  ssh {
    user = "deploy"
  }
}
```

To configure servers created in the same plan, build the map from the resource. The circuit's steps then wait for the servers:

```hcl
variable "app_addresses" {
  type = map(string)
}

resource "terraform_data" "app" {
  for_each = var.app_addresses
  input    = each.value
}

circuit "app" {
  hosts = { for name, server in terraform_data.app : name => server.output }

  ssh {
    user = "root"
  }
}
```

For a complete example with DigitalOcean droplets and host keys pinned at creation, see [Provision and configure](/guides/provision-and-configure).

### From an Ansible inventory

Already have an inventory? Keep it. `provider::conn3x::inventory` reads one group from an INI or YAML inventory and returns it as host objects, so you don't retype the list. New in v0.16.0.

```ini
# inventory.ini
[web]
web1 ansible_host=203.0.113.10
web2 ansible_host=203.0.113.11 ansible_port=2222 role=canary

[web:vars]
role=app
```

```hcl
terraform {
  required_providers {
    conn3x = { source = "terraform.io/builtin/conn3x" }
  }
}

circuit "web" {
  hosts = provider::conn3x::inventory("${path.module}/inventory.ini", "web")

  ssh {
    user = "deploy"
  }

  step "motd" {
    file {
      path    = "/etc/motd"
      content = "This is ${each.key}, a ${each.value.vars.role} server.\n"
    }
  }
}
```

Provider functions need their provider in `required_providers`, as in OpenTofu. Conn3x is built in, so that's the only setup.

Each host comes back as a [host object](#host-object-fields), keyed by its inventory name:

| Inventory | Host object |
| --- | --- |
| `ansible_host` | `address`. Without it, the address is the host's name. |
| `ansible_port` | `port` |
| `ansible_user` | `user` |
| `ansible_ssh_private_key_file` | `private_key_file` |
| Every variable, `ansible_*` ones included | `vars`, a map of strings |

A host that doesn't set one of the first four leaves it to the circuit's `ssh` block. Above, `web2` gets `role = "canary"` and `web1` gets `app`.

`vars` also takes in the `group_vars/` and `host_vars/` directories beside the inventory, and resolves everything the way Ansible does:

1. The inventory file's group variables: `all`'s, then each group's from the outermost in.
2. `group_vars/all`, then `group_vars/<group>`, from the outermost group in.
3. The inventory file's host variables.
4. `host_vars/<host>`.

For each group or host, Conn3x reads a file called `web`, `web.yml`, `web.yaml` or `web.json`, or every such file in a `web/` directory, in name order. Only plain values come through: a list or a map is left out, since `vars` holds strings. So is a value encrypted with Ansible Vault. A whole file encrypted with Vault is an error.

The group takes in its child groups' hosts, and `"all"` takes in every host. An unknown group is an error that lists the groups the file has. A relative path is relative to where you run Conn3x, which is why the example starts with `path.module`.

Host ranges expand as in Ansible: `web[01:20]` is `web01` to `web20`, `db-[a:f]` is `db-a` to `db-f`, and `[1:9:2]` counts in twos.

Not read yet: `group_vars/` beside the playbook rather than the inventory, and dynamic inventory scripts or plugins.

## Host object fields

| Field | Type | Description |
| --- | --- | --- |
| `address` | string | Required. The hostname or IP address to connect to. |
| `user` | string | Overrides the `ssh` block's `user`. |
| `port` | number | Overrides the `ssh` block's `port`. |
| `private_key_file` | string | Overrides the `ssh` block's `private_key_file`. |
| `host_key` | string | Overrides the `ssh` block's `host_key`. Use it to pin each host's own key. |
| `jump_hosts` | list of strings | Overrides the `ssh` block's `jump_hosts`. An empty list connects to this host directly. |

Only these five settings can be overridden per host. The others, such as `become`, `known_hosts_file` and `timeout`, come from the `ssh` block for every host.

A host object can hold fields of your own as well. Conn3x doesn't use them to connect, and steps can read them as `each.value.FIELD`:

```hcl
circuit "app" {
  hosts = {
    app1 = { address = "10.0.1.5", role = "primary" }
    app2 = { address = "10.0.1.6", role = "replica" }
  }

  ssh {
    user = "deploy"
  }

  step "role" {
    file {
      path    = "/etc/app/role"
      content = "${each.value.role}\n"
    }
  }
}
```

What a host object can't hold is an ssh setting that only the `ssh` block takes: ssh settings such as `become`, `timeout` and `known_hosts_file` belong in the ssh block. Naming one in a host object is an error, not a setting that quietly does nothing. `validate` reports it when `hosts` is known, and `plan` reports it otherwise:

```text
Error: Unsupported field in host object

Host "web1" sets "become", which only the circuit's ssh block takes. A host
object can set address, user, port, private_key_file, host_key and
jump_hosts, plus any fields of your own to read with each.value.
```

See [The ssh block](/reference/circuits/ssh#precedence) for how host objects, the `ssh` block and an SSH config file combine.

## each.key and each.value

Inside a step's module block, `each.key` is the host's name and `each.value` is its entry in `hosts`: the address string, or the host object. With a set of addresses, both are the address.

The same holds in a step with its own `for_each`. There, `item.key` and `item.value` are the item, and `each` is still the host. See [Steps](/reference/circuits/steps#for_each).

## Layered host data

New in v0.18.0. Set a value once for every host, then override it for an environment, a group or one host, the way Puppet's Hiera does. The layers are YAML files in a directory, and a `hierarchy.yaml` there lists them, highest priority first:

```yaml
hierarchy:
  - hosts/{host}.yaml
  - groups/{group}.yaml
  - env/{env}.yaml
  - common.yaml
```

`provider::conn3x::hostdata` reads them for one host:

```hcl
step "ntp" {
  file {
    path    = "/etc/chrony.d/servers.conf"
    content = join("\n", [
      for s in provider::conn3x::hostdata("${path.module}/data", {
        host  = each.key
        group = ["web", "eu"]
        env   = var.env
      }).values.ntp_servers : "server ${s} iburst"
    ])
  }
}
```

- Each top-level key comes from the first layer that sets it. So `ntp_servers` in `groups/eu.yaml` beats the one in `common.yaml`, and `hosts/web1.yaml` beats both.
- A placeholder given a list, such as `group` above, makes one layer per item, in the order you give them.
- `values` keeps the YAML types, numbers and lists included. `from` maps each key to the file it came from. Put it in an output when you need to see why a host got a value.
- A layer whose file doesn't exist is skipped. A placeholder that `vars` doesn't set is an error, so a typo can't quietly skip a layer.
- Write the hierarchy as a block list, or quote each path: in a `[ ]` list, YAML reads `{host}` as a mapping.
- The function refuses a SOPS-encrypted layer, since whatever it returns can land in plan and state. Read a hierarchy with secrets in it through the ephemeral reader below.

### Encrypted layers

Since v0.19.0, `ephemeral "conn3x_hostdata"` reads the same hierarchy with the same rule, first layer wins, and decrypts the layers that are encrypted with SOPS and age, such as a `common.sops.yaml` holding each environment's database password. It's ephemeral, so its values never reach plan or state. Use them in write-only arguments, such as `content_wo` and `password_wo`.

```hcl
ephemeral "conn3x_hostdata" "web1" {
  dir  = "${path.module}/data"
  vars = { host = "web1", group = ["web"] }
}

resource "conn3x_file" "db_password" {
  path       = "/etc/db_password"
  content_wo = ephemeral.conn3x_hostdata.web1.values.db_password
  mode       = "0600"
  # ssh { ... }
}
```

It finds the age key the way sops does: `SOPS_AGE_KEY`, `SOPS_AGE_KEY_FILE`, or `sops/age/keys.txt` in your config directory. A value from an encrypted layer is a string, with nested keys joined by dots, such as `db.password`, as [`conn3x_secrets`](/reference/circuits/secrets#sops-files) gives them, and `from` names the file it came from.

Provider functions need `conn3x` in `required_providers`, as for the [inventory function](#from-an-ansible-inventory).

## Instance keys

Every resource a circuit creates has one instance per host, keyed by the host's key in `hosts`:

| `hosts` | Instance keys |
| --- | --- |
| `{ web1 = "203.0.113.10" }` | `["web1"]` |
| `{ db1 = { address = "10.0.0.5" } }` | `["db1"]` |
| `toset(["203.0.113.10"])` | `["203.0.113.10"]` |

A step with `for_each` has one instance per host and item, keyed `"HOST/ITEM"`, such as `["web1/git"]`.

The key is the host's identity in state, so choose names that won't change.

## Adding, removing and renaming hosts

- Add a host to `hosts`, and the next plan creates every step on it, and runs every notified handler on it.
- Remove a host, and the next plan destroys that host's instances of every step. What happens on the host depends on each step's [`on_remove`](/reference/circuits/removal).
- Rename a host's key, and Conn3x sees one host removed and another added. To keep the existing instances under the new name, use a `moved` block or `conn3x state mv`. See [Resource addresses](/reference/circuits/addresses#renaming).
