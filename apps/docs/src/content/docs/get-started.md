---
title: Get started
description: Configure a Linux server with your first circuit, then watch Conn3x catch a hand edit.
---

In this tutorial you'll put nginx on a server you already have, serve a page from it, and then edit that page by hand to see how Conn3x notices. It takes about fifteen minutes.

**You need:**

- Conn3x [installed](/install).
- A Linux server running Rocky, RHEL, AlmaLinux, Fedora, Debian or Ubuntu that you can reach over SSH as root, or as a user who can `sudo`. A fresh cloud server is ideal; don't use one that matters.
- The server's host key in your `~/.ssh/known_hosts`. Conn3x always checks it, so connect once with `ssh` first and confirm the fingerprint.

## Write the circuit

Make a directory and create `main.circuit.hcl` in it. Put your server's address in `hosts` and your login in the `ssh` block.

```hcl
circuit "web" {
  hosts = { web1 = "203.0.113.10" }

  ssh {
    user             = "root"
    private_key_file = "~/.ssh/id_ed25519"
  }

  step "nginx" {
    package {
      name = "nginx"
    }
  }

  step "page" {
    file {
      path    = "/usr/share/nginx/html/index.html"
      content = "<h1>Hello from ${each.key}</h1>\n"
    }
  }

  step "running" {
    service {
      name    = "nginx"
      state   = "started"
      enabled = true
    }
  }
}
```

A **circuit** is a set of steps for a group of hosts. Each **step** uses one module, and steps run in the order you write them. `each.key` is the host's name from `hosts`, here `web1`.

If you log in as a regular user, add `become = true` to the `ssh` block, and Conn3x will use `sudo`.

On Debian and Ubuntu, nginx serves `/var/www/html/index.nginx-debian.html` by default. Use `/var/www/html/index.html` as the `path` there.

## Plan

```sh
conn3x init
conn3x plan
```

Conn3x connects, reads what's on the server, and shows what it would change:

```text
Conn3x will perform the following actions:

  # conn3x_package.web__nginx["web1"] will be created
  # conn3x_file.web__page["web1"] will be created
  # conn3x_service.web__running["web1"] will be created
```

Nothing has changed on the server yet.

## Apply

```sh
conn3x apply
```

Type `yes` when asked. Then open `http://203.0.113.10/` in a browser, or run `curl` on it. You'll see `Hello from web1`. If the page doesn't load, check the server's firewall allows port 80. The [firewalld](/modules/firewalld) and [ufw](/modules/ufw) modules can open it.

Run `conn3x plan` again. It says `No changes.`: the server matches the circuit.

## Change something by hand

Log in to the server and edit the page:

```sh
echo 'edited by hand' > /usr/share/nginx/html/index.html
```

Back on your machine, ask Conn3x what changed:

```sh
conn3x drift
```

```text
Drift found in 1 resource.

Hosts
  ~ conn3x_file.web__page["web1"]  changed
```

`drift` changes nothing and exits with code 2, so you can run it on a schedule. To see the fix, run `conn3x plan`, which shows the exact diff it would make. `conn3x apply` puts the page back.

## Clean up

`conn3x destroy` removes the steps from Conn3x's state. By default it leaves files and packages on the server, so destroying a circuit can't break a machine by surprise. Each module's page says what it does on removal.

## Next

- [Create the server in the same plan](/guides/provision-and-configure), so its address flows straight into the circuit.
- Read the [concepts](/concepts) behind circuits, plans and drift.
- Browse the [modules](/modules/file).
