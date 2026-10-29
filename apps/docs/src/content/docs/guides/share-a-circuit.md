---
title: Share a circuit
description: Package a circuit as a module others can use, version it with tags, test it on a container, and list it on conn3x.org/circuits.
---

If you've written a circuit that sets up nginx, your users or a monitoring agent, it's probably useful on servers besides yours. A shared circuit is an ordinary OpenTofu module with a circuit inside it. Anyone can use it with a `module` block that points at your repository and a tag:

```hcl
module "web" {
  source = "github.com/you/circuit-postgres?ref=v0.1.0"
  hosts  = { db1 = "203.0.113.20" }
}
```

`conn3x init` fetches it, and the plan shows every step it will take on every host, the same as for a circuit of your own. This guide covers writing one to share. The [official circuits](https://conn3x.org/circuits) follow it, so read one of them alongside.

Shared circuits need Conn3x v0.6.4 or later.

## Take hosts as a variable

The caller decides which servers to configure, so `hosts` comes in as a variable. Hosts can be plain addresses or [host objects](/reference/circuits/hosts) with fields such as `host_key`, and a caller can mix the two in one map. `map(any)` can't hold that mix, so use `any`, and check the shape with a validation:

```hcl
variable "hosts" {
  type        = any
  description = "A map of names to addresses, or to host objects with an address and settings such as host_key."

  validation {
    condition     = can(keys(var.hosts)) && alltrue([for v in values(var.hosts) : can(tostring(v)) || can(tostring(v.address))])
    error_message = "hosts must be a map whose values are addresses, or objects with an address."
  }
}
```

Taking host objects matters most for servers made in the same plan. The caller can pin each new server's host key, as the [DigitalOcean tutorial](/tutorials/digitalocean) does, so Conn3x checks it on the first connection.

## Take the ssh settings as variables

The way in is the caller's business too. Give each [`ssh` setting](/reference/circuits/ssh) a variable with a sensible default, and pass them through. A `null` is the same as leaving a setting out, so Conn3x falls back to its own default:

```hcl
variable "ssh_user" {
  type    = string
  default = "root"
}

variable "ssh_private_key_file" {
  type    = string
  default = null
}

circuit "postgres" {
  hosts = var.hosts

  ssh {
    user             = var.ssh_user
    private_key_file = var.ssh_private_key_file
  }

  # steps
}
```

The official circuits name these `ssh_user`, `ssh_port`, `ssh_private_key_file`, `ssh_known_hosts_file` and `ssh_become`. Using the same names means a caller can pass the same values to every circuit they use.

## Make optional parts a for_each

When part of the circuit is optional, such as opening a firewall port or adding a sudoers file, give its step a `for_each` that's empty when the part isn't wanted:

```hcl
step "port" {
  for_each = var.open_firewall ? { http = var.port } : {}
  firewalld {
    port = "${item.value}/tcp"
  }
}
```

An empty `for_each` gives the step no instances, so nothing runs for it.

## Handle the differences between distributions

Package and service names differ across distributions: `chronyd` on Rocky and Fedora is `chrony` on Debian and Ubuntu. Read the host's family with [`conn3x_host`](/reference/host-facts) and choose from it. Where you can't tell what a host needs, take a variable and document its default.

## Test it on a container

Before you tag a version, apply your circuit to a fresh host and run `conn3x plan` again. The second plan has to say `No changes.` If it doesn't, a step is reporting a change it didn't make, or making one it didn't plan.

The [try-it-locally example](https://github.com/conn3xorg/conn3x/tree/main/examples/try-it-locally) starts a Rocky Linux 10 container with SSH that you can point an `examples/local` configuration at. The official circuits do the same in CI on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13, with `conn3x plan -detailed-exitcode` failing the job when the second plan isn't empty. Copy their workflow if you like.

A container isn't a whole server, so some steps need more from it. firewalld and ufw need the `NET_ADMIN` and `NET_RAW` capabilities, so start the container with `--cap-add NET_ADMIN,NET_RAW`. `sysctl` writes to `/proc/sys`, which a container can only change when it runs with `--privileged`. Minimal images may also leave out `tzdata`, which `timezone` needs; install it in an earlier step.

## Version it with tags

Callers pin a tag with `?ref=`, so each release is a git tag, such as `v0.1.0`. Never move a tag once people use it. Make a new one: someone who pinned `v0.1.0` should get exactly what they read and tested. Say what changed in the release notes, and note anything that replaces or removes something on the host.

## Write the README

The README is what people read before they run your code as root on their servers. Say:

- what the circuit does to a host, step by step
- usage, with a `module` block they can copy
- every input, with its type and default
- every output
- which distributions you've tested it on
- what removing it leaves behind, since most modules default to [`on_remove = "forget"`](/reference/circuits/removal)

## List it

Put the circuit in a public repository with an open-source licence and at least one tag. Then list it on [conn3x.org/circuits](https://conn3x.org/circuits) in one of two ways:

- **Fill in the form.** The [Share a circuit](https://github.com/conn3xorg/web/issues/new?template=share-a-circuit.yml) issue form asks for the repository, the tag and a one-line description, and we add it.
- **Open a pull request.** Add one JSON file to [`apps/site/src/data/circuits/`](https://github.com/conn3xorg/web/tree/main/apps/site/src/data/circuits) in conn3xorg/web, named after the circuit:

  ```json
  {
    "name": "postgres",
    "repo": "you/circuit-postgres",
    "description": "Installs PostgreSQL, creates your databases and roles, and keeps the service running.",
    "version": "v0.1.0",
    "tags": ["database", "postgres"],
    "tested": ["rocky10", "debian13"],
    "category": "Databases and caches",
    "official": false
  }
  ```

  `category` is one of the names in [`categories.json`](https://github.com/conn3xorg/web/blob/main/apps/site/src/data/categories.json), and it's the filter your circuit shows up under on the page.

Before we list a circuit, we check that `conn3x validate` passes, read it through, and make sure the README covers the points above. When you release a new version, open a pull request that bumps `version`.
