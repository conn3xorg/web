---
title: Configure your first real server
description: Write a circuit for a Linux server you already have, log in with sudo, install and configure nginx, and reload it with a handler when its configuration changes.
---

In this tutorial you'll write a circuit from scratch for a server you already run. You'll log in as a regular user with sudo, install nginx, give it a small status page on port 8080, and keep it running. Then you'll change the page and watch a handler reload nginx, on that change only.

**Time:** 15 minutes.

## Prerequisites

- Conn3x v0.5.0 [installed](/install). [Try Conn3x locally](/tutorials/try-locally) is a good first step but not required.
- A Linux server running Rocky Linux, RHEL, AlmaLinux, Fedora, Debian or Ubuntu. Use one you can afford to change, such as a fresh cloud server or a VM. This tutorial uses `203.0.113.10`; use your server's address instead.
- A user on the server that can run `sudo` without a password, and whose `~/.ssh/authorized_keys` has your public key. This tutorial calls the user `admin` and the key `~/.ssh/id_ed25519`.
- Nothing else listening on port 8080 on the server.

If your user's sudo asks for a password, add `become_password_file` to the `ssh` block in the steps below. [The ssh block](/reference/circuits/ssh#become) explains how Conn3x uses it.

## Record the server's host key

Conn3x always checks host keys, and by default it checks them against `~/.ssh/known_hosts`. If you've logged in to the server with `ssh` before, its key is already there. If not, log in once and confirm the fingerprint:

```sh
ssh admin@203.0.113.10 true
```

## Write the circuit

Create a directory for the tutorial and change into it:

```sh
mkdir first-server
cd first-server
```

Create `main.circuit.hcl` with this content:

```hcl
circuit "web" {
  hosts = { web1 = "203.0.113.10" }

  ssh {
    user             = "admin"
    private_key_file = "~/.ssh/id_ed25519"
    become           = true
  }

  step "nginx" {
    package {
      name = "nginx"
    }
  }

  step "status_page" {
    file {
      path    = "/etc/nginx/conf.d/status.conf"
      content = <<-EOT
        server {
          listen 8080;
          location /status {
            return 200 "${each.key} is up\n";
          }
        }
      EOT
    }
    notify = [handler.reload_nginx]
  }

  step "nginx_running" {
    service {
      name    = "nginx"
      state   = "started"
      enabled = true
    }
  }

  handler "reload_nginx" {
    service {
      name   = "nginx"
      action = "reload"
    }
  }
}
```

The circuit has four parts:

- **`hosts`** names the server `web1` and gives its address. The name is how the server appears in plans and state, so pick one that won't change. See [Hosts](/reference/circuits/hosts).
- **The `ssh` block** logs in as `admin` with your key. `become = true` runs every command through `sudo`. See [The ssh block](/reference/circuits/ssh).
- **Three steps** run in order: install the [`package`](/modules/package), write the nginx configuration with [`file`](/modules/file), and make sure the [`service`](/modules/service) is started and enabled at boot.
- **A handler** reloads nginx. It runs only when a step that lists it in `notify` changes something. See [Handlers](/reference/circuits/handlers).

nginx on all six supported distributions reads `/etc/nginx/conf.d/*.conf`, so the same file works everywhere.

## Initialize and check the configuration

```sh
conn3x init
conn3x validate
```

```text
Success! The configuration is valid.
```

`validate` checks the circuit without connecting to the server. A typo in a module argument or a `notify` that names a missing handler shows up here.

## Plan

```sh
conn3x plan
```

The plan lists four resources. The status page shows the content Conn3x will write, with `${each.key}` filled in:

```text
  # conn3x_file.web__status_page["web1"] will be created
  + resource "conn3x_file" "web__status_page" {
      + content    = <<-EOT
            server {
              listen 8080;
              location /status {
                return 200 "web1 is up\n";
              }
            }
        EOT
```

The handler appears as a `conn3x_service_action` resource:

```text
  # conn3x_service_action.web__reload_nginx["web1"] will be created
  + resource "conn3x_service_action" "web__reload_nginx" {
      + action   = "reload"
```

```text
Plan: 4 to add, 0 to change, 0 to destroy.
```

## Apply

```sh
conn3x apply
```

Type `yes` when asked. The steps run in the order written, then the handler. The output here is shortened: Conn3x also prints each resource's ID, which starts with the server's address.

```text
conn3x_package.web__nginx["web1"]: Creating...
conn3x_package.web__nginx["web1"]: Still creating... [10s elapsed]
conn3x_package.web__nginx["web1"]: Creation complete after 11s
conn3x_file.web__status_page["web1"]: Creating...
conn3x_file.web__status_page["web1"]: Creation complete after 0s
conn3x_service.web__nginx_running["web1"]: Creating...
conn3x_service.web__nginx_running["web1"]: Creation complete after 0s
conn3x_service_action.web__reload_nginx["web1"]: Creating...
conn3x_service_action.web__reload_nginx["web1"]: Creation complete after 0s

Apply complete! Resources: 4 added, 0 changed, 0 destroyed.
```

A handler always runs the first time a circuit is applied to a host, so nginx reloaded once here.

Check the page from the server itself, so a firewall doesn't get in the way:

```sh
ssh admin@203.0.113.10 curl -s localhost:8080/status
```

```text
web1 is up
```

Run `conn3x plan` again. It reads all four steps back from the server and reports `No changes. Your infrastructure matches the configuration.`

## Change one thing

Edit the `return` line in `main.circuit.hcl`:

```hcl
circuit "web" {
  hosts = { web1 = "203.0.113.10" }

  ssh {
    user             = "admin"
    private_key_file = "~/.ssh/id_ed25519"
    become           = true
  }

  step "nginx" {
    package {
      name = "nginx"
    }
  }

  step "status_page" {
    file {
      path    = "/etc/nginx/conf.d/status.conf"
      content = <<-EOT
        server {
          listen 8080;
          location /status {
            return 200 "${each.key} is up, served by nginx\n";
          }
        }
      EOT
    }
    notify = [handler.reload_nginx]
  }

  step "nginx_running" {
    service {
      name    = "nginx"
      state   = "started"
      enabled = true
    }
  }

  handler "reload_nginx" {
    service {
      name   = "nginx"
      action = "reload"
    }
  }
}
```

Plan:

```sh
conn3x plan
```

```text
  # conn3x_file.web__status_page["web1"] will be updated in-place
  ~ resource "conn3x_file" "web__status_page" {
      ~ content    = <<-EOT
            server {
              listen 8080;
              location /status {
          -     return 200 "web1 is up\n";
          +     return 200 "web1 is up, served by nginx\n";
              }
            }
        EOT
```

```text
  # conn3x_service_action.web__reload_nginx["web1"] must be replaced
-/+ resource "conn3x_service_action" "web__reload_nginx" {
```

```text
Plan: 1 to add, 1 to change, 1 to destroy.
```

The file shows the one line that changes. The package and the service aren't in the plan, because the server already matches them. The handler is planned for replacement because the file step it watches will change: replacing a handler's resource is how Conn3x runs it. A plan with `1 to destroy` here doesn't remove anything from the server.

Apply it, and type `yes`. The output is shortened in the same way:

```sh
conn3x apply
```

```text
conn3x_service_action.web__reload_nginx["web1"]: Destroying...
conn3x_service_action.web__reload_nginx["web1"]: Destruction complete after 0s
conn3x_file.web__status_page["web1"]: Modifying...
conn3x_file.web__status_page["web1"]: Modifications complete after 0s
conn3x_service_action.web__reload_nginx["web1"]: Creating...
conn3x_service_action.web__reload_nginx["web1"]: Creation complete after 0s

Apply complete! Resources: 1 added, 1 changed, 1 destroyed.
```

nginx reloaded after the file changed, and serves the new text:

```sh
ssh admin@203.0.113.10 curl -s localhost:8080/status
```

```text
web1 is up, served by nginx
```

If you apply again without changing anything, the handler doesn't run, because no step that notifies it changed.

## Clean up

`conn3x destroy` removes the steps from Conn3x's state. By default it leaves the package, the file and the running service on the server, so destroying a circuit can't take a server down by surprise.

To have destroy delete the status page, set `on_remove = "delete"` on the file step first and apply. The apply changes only the recorded setting, and reloads nginx once more:

```hcl
  step "status_page" {
    file {
      path      = "/etc/nginx/conf.d/status.conf"
      content   = <<-EOT
        server {
          listen 8080;
          location /status {
            return 200 "${each.key} is up, served by nginx\n";
          }
        }
      EOT
      on_remove = "delete"
    }
    notify = [handler.reload_nginx]
  }
```

```sh
conn3x apply
conn3x destroy
```

Type `yes` at each prompt. Destroy ends with `Destroy complete! Resources: 4 destroyed.`, and `/etc/nginx/conf.d/status.conf` is gone. nginx stays installed and running, because the package and service steps still use the default, `forget`. Run `sudo systemctl reload nginx` on the server to stop serving port 8080, or uninstall nginx if you don't need it. [Removal](/reference/circuits/removal) lists what `on_remove` does for every module.

## Next steps

- [Provision and configure on DigitalOcean](/tutorials/digitalocean), so Conn3x creates the server as well.
- [Reach hosts through a bastion](/tutorials/bastion), for servers on a private network.
- Browse the [modules](/modules/file) for users, firewall rules, cron jobs and more.
