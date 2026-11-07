---
title: Conn3x vs Ansible
description: "Conn3x compared with Ansible: one playbook converted and run both ways, plan and state against check mode, and where Ansible is the better choice."
---

This page is for you if Ansible configures your servers and you don't use Terraform or OpenTofu. Maybe the servers already exist, or someone else creates them. You want to know whether Conn3x is worth a look, and what you'd give up.

Both tools log in over SSH and run what you've described, with nothing to install on the host first. Both run tasks in order and fire handlers when something changed. If you write Ansible, you already think the way a circuit works. The differences are in what you see before a run, and what's remembered after it.

## What's different

With Ansible, the playbook is the truth and the host is checked against it on every run. There's no state file, and for a lot of work that's exactly what you want: nothing to store, lock or back up.

Conn3x keeps state. It's built on [OpenTofu](https://opentofu.org), and it uses OpenTofu's plan and state for servers the way OpenTofu uses them for cloud resources. That buys you three things:

- **A plan on every run.** Once a step has been applied, `conn3x plan` reads it back from the host and shows the diff, and `conn3x apply` shows it again and asks before it changes anything. Save it with `-out` and the apply does exactly what you reviewed.
- **A record of the last apply.** `conn3x drift` compares the hosts with what was applied, changes nothing, and exits `2` when something has moved, so a scheduled job can alert on it.
- **Removal you can see.** Delete a step and the plan lists it. Each module's [`on_remove`](/reference/circuits/removal) decides what happens on the host. Most leave things in place by default, and most let you choose to clean up instead.

It costs you something too. State is one more thing to look after: somewhere to keep it, locking when a team shares it, and encryption when it holds a secret.

## At a glance

| | Ansible | Conn3x |
| --- | --- | --- |
| Connection | SSH, agentless; WinRM or SSH for Windows; network connection plugins for devices | SSH, agentless, Linux and Windows. An optional host agent is experimental and off by default |
| Language | YAML, with Jinja for templates and expressions | HCL, with `templatefile` syntax for templates |
| Before a run | `--check --diff`, as far as each module supports check mode | `conn3x plan`, every time, and a saved plan with `-out` |
| State | None, by design | A state file, which OpenTofu can encrypt |
| Spotting hand edits | Rerun with `--check --diff` and read the recap. It exits `0` when it finds changes | `conn3x drift`, which exits `2` |
| Removing something | Delete the task and the host keeps it, unrecorded. Write a `state: absent` task to remove it | Delete the step and the plan shows it; `on_remove` decides what the host keeps |
| Cloud resources | Cloud collections such as `amazon.aws`, `azure.azcollection` and `google.cloud` | Any OpenTofu provider, in the same plan as the servers |
| Ad-hoc commands | `ansible all -a "uptime"` | None |
| Modules | A very large ecosystem of collections on Ansible Galaxy | 34 Linux modules, 18 experimental Windows modules, and [125 official circuits](/circuits) |
| Windows | Long established | [Preview](/reference/maturity#preview-and-experimental-together), with experimental modules |
| Network devices | Collections for many vendors' switches, routers and firewalls | Three experimental circuits, through community OpenTofu providers |
| UI and access control | AWX, and Red Hat Ansible Automation Platform | None. Conn3x is a CLI that CI or cron runs |
| Maturity | In production use for more than a decade | Before 1.0, at v0.7.1 |

## The same playbook, both ways

Here's a small playbook that installs nginx, writes a site config that answers on port 8080, and starts the service. The config reloads nginx when it changes. Save it as `site.yml`:

```yaml
- hosts: web
  become: true
  tasks:
    - name: Install nginx
      ansible.builtin.package:
        name: nginx
        state: present

    - name: Write the site config
      ansible.builtin.copy:
        dest: /etc/nginx/conf.d/app.conf
        content: |
          server {
            listen 8080;
            location / {
              return 200 "Hello from {{ inventory_hostname }}\n";
            }
          }
        mode: "0644"
      notify: Reload nginx

    - name: Start nginx
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true

  handlers:
    - name: Reload nginx
      ansible.builtin.service:
        name: nginx
        state: reloaded
```

And an inventory, `hosts.ini`:

```ini
[web]
web1 ansible_host=203.0.113.10 ansible_user=deploy
```

### Convert it

You don't have to rewrite anything to see what this looks like as a circuit:

```sh
conn3x convert ansible -i hosts.ini -out web.circuit.hcl site.yml
```

This is the converter's real answer, from Conn3x v0.7.1:

```text
Converted 2 tasks. 1 thing needs you; each is marked TODO(convert):
  line 9, Write the site config: content refers to "inventory_hostname", which isn't a play variable the converter can fill in
```

It exits with code `3`, meaning it wrote the file and something is left. The package, the service and the handler came across. The config didn't, because `inventory_hostname` is a magic variable, not one of the play's `vars`, and the converter only fills in what it can show means the same thing. It leaves the task as commented YAML instead of guessing. Here's the middle of `web.circuit.hcl`, with that comment shortened:

```hcl
  step "install_nginx" {
    package {
      name = "nginx"
    }
  }

  # TODO(convert): Task "Write the site config" (site.yml line 9) content refers to "inventory_hostname", which isn't a play variable the converter can fill in.
  #   - name: Write the site config
  #     ansible.builtin.copy:
  #       dest: /etc/nginx/conf.d/app.conf
  #       ...
  #     notify: Reload nginx

  step "start_nginx" {
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
```

It also wrote the circuit's `hosts` from the inventory, `user = "deploy"` from `ansible_user`, `become = true` from the play, and a variable for your private key. Finishing the TODO is one step. The host's name in a circuit is `each.key`:

```hcl
  step "write_the_site_config" {
    file {
      path    = "/etc/nginx/conf.d/app.conf"
      content = <<-EOT
        server {
          listen 8080;
          location / {
            return 200 "Hello from ${each.key}\n";
          }
        }
      EOT
    }
    notify = [handler.reload_nginx]
  }
```

### Catch a hand edit, both ways

To compare the two fairly, we pointed both at the same throwaway Rocky Linux 10 container with systemd, built from the `Containerfile` in [circuit-nginx's local example](https://github.com/conn3xorg/circuit-nginx/tree/v0.2.1/examples/local). We applied the converted circuit, with its TODO finished and `hosts` and `ssh` pointed at the container, then logged in and added `access_log off;` to the config by hand. Everything below is real output from those runs, trimmed where it says so.

Ansible 2.21's check mode, `ansible-playbook --check --diff site.yml`, with the warnings and recap trimmed:

```text
TASK [Write the site config] ***************************************************
--- before: /etc/nginx/conf.d/app.conf
+++ after: /etc/nginx/conf.d/app.conf
@@ -1,6 +1,5 @@
 server {
   listen 8080;
-  access_log off;
   location / {
     return 200 "Hello from web1\n";
   }

changed: [web1]

TASK [Start nginx] *************************************************************
ok: [web1]

RUNNING HANDLER [Reload nginx] *************************************************
changed: [web1]
```

That's a good answer, and it's worth saying plainly: for a file, Ansible's check mode finds the same edit and shows the same diff. It exited `0`, as it does whenever nothing fails.

`conn3x plan`, with the handler's entry trimmed:

```text
  # conn3x_file.web__write_the_site_config["web1"] will be updated in-place
  ~ resource "conn3x_file" "web__write_the_site_config" {
      ~ content    = <<-EOT
            server {
              listen 8080;
          -   access_log off;
              location / {
                return 200 "Hello from web1\n";
              }
            }
        EOT
      ~ content_wo = (write-only attribute)
        id         = "127.0.0.1:2299:/etc/nginx/conf.d/app.conf"
      ~ revision   = "f45d03b2e900beb6" -> (known after apply)
      ~ sha256     = "87e78eda4bda792140b41a833a7557c84224d0a23ce8831272001228d0b52562" -> "3eb5b493ef0a22f537bc4d4f6fa9151b97161ff194ca2565997fb5bca1adfaa4"
      ~ validate   = (write-only attribute)
        # (3 unchanged attributes hidden)

        # (1 unchanged block hidden)
    }

  # conn3x_service_action.web__reload_nginx["web1"] must be replaced

Plan: 1 to add, 1 to change, 1 to destroy.
```

The `1 to add` and `1 to destroy` are the reload handler being replaced, which is how the plan tells you nginx will reload. And `conn3x drift`, which exited `2`:

```text
Drift found in 1 resource.

Hosts
  ~ conn3x_file.web__write_the_site_config["web1"]  changed

Run conn3x plan to see what Conn3x would change to put them back.
```

So the preview is close. Where the two part ways is everything around it: Conn3x compares against what it last applied, saves the plan you approved, shows a removed step as a removal, and puts a new server from any OpenTofu provider in the same plan when you want one.

## Where Ansible is the better choice

There are plenty of jobs where Ansible is the right tool, and we'd rather say so:

- Ad-hoc work. `ansible all -m ping`, or a one-off command across a group during an incident, is quick and useful. Conn3x has no ad-hoc mode: it only runs what a circuit describes.
- Network gear. Ansible's network collections cover switches, routers and firewalls from many vendors, over their CLIs and APIs. Conn3x has three experimental network circuits, and talking to devices over their own CLI is only planned.
- Windows at scale. Ansible's Windows support has years of production use behind it. Windows in Conn3x is a preview, every `windows_*` module is experimental, and domain join isn't there yet.
- The ecosystem. Galaxy has roles and collections for almost anything you'd want to configure. Conn3x has 34 Linux modules and 125 circuits, which cover a lot of ground and are still a much smaller set.
- No state to look after. If you don't want a state file anywhere, Ansible's stateless model is a real advantage, not a gap.
- A UI, credentials and access control. AWX and Red Hat Ansible Automation Platform give a team job templates, a credential store, RBAC and a web UI. Conn3x has none of that; you run it from CI.
- Team familiarity. Ansible is widely known, widely taught and well documented. A team that's fluent in it gives up real speed by switching.
- Maturity. Conn3x is at v0.7.1. Stable parts are tested on every change, but before 1.0 a release can still change how you write something. [Maturity labels](/reference/maturity) says what each label promises.

You don't have to choose for every server at once. Converting one playbook and running Conn3x for that group, while Ansible keeps the rest, is a fair way to find out.

## What the converter can't convert

The converter is [stable](/reference/maturity), and it marks what it can't prove instead of guessing. These come across as `TODO(convert)` comments for you to finish:

- Roles, `include_tasks` and `import_tasks`. Add each role's tasks as steps.
- Jinja templates and filters. Rewrite them in `templatefile` syntax for a [template](/modules/template) step.
- Magic variables such as `inventory_hostname`, and anything that isn't one of the play's `vars`.
- Control flow: `when`, `register`, `with_*`, `until`, `ignore_errors`, and any `loop` other than a plain list.
- Anything under `no_log`, with its values left out of the comment.
- Commands that ran on every play, until you give them a `creates`, `removes` or `unless` guard, or `triggers`.
- Modules it doesn't know, and arguments it doesn't know on modules it does.

[Migrate from Ansible](/guides/migrate-from-ansible) lists every module it converts and every case it leaves.

## What Conn3x can't do yet

- Windows Server is in preview, with experimental modules. Joining a domain and adding a second domain controller aren't there yet.
- Network devices are limited to three experimental circuits, with no device CLI connection.
- macOS hosts are planned, not shipped.
- There's no ad-hoc command, no web UI and no built-in credential store.

The [roadmap](/roadmap) has the order we're building things in.

## Next step

[Migrate from Ansible](/guides/migrate-from-ansible): point the converter at one of your own playbooks and see how much carries over. If you'd like to see a plan and a drift check first, [Try Conn3x locally](/tutorials/try-locally) does that on a throwaway container in about ten minutes.
