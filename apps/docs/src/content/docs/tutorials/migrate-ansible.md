---
title: Migrate an Ansible playbook
description: Convert a small playbook with conn3x convert ansible, finish the tasks it marks TODO, validate the result, and apply it.
---

In this tutorial you'll convert a short Ansible playbook into a circuit. The converter translates the tasks it can, and leaves the rest as commented YAML marked `TODO(convert)`. You'll read each TODO, finish it by hand, and validate the circuit until it's ready to apply.

**Time:** 15 minutes.

## Prerequisites

- Conn3x v0.6.0 [installed](/install). You don't need Ansible.
- To apply the result: a Rocky Linux, RHEL, AlmaLinux or Fedora server with firewalld running, and a user with passwordless `sudo`, as in [Configure your first real server](/tutorials/first-server). You can convert and validate without one.

## The playbook

Create a directory with two files in it. `site.yml` installs nginx, gives it a status page on port 8080, installs two tools, and opens the port in the firewall:

```yaml
- hosts: web
  become: true
  vars:
    status_port: 8080
  tasks:
    - name: Install nginx
      ansible.builtin.dnf:
        name: nginx
        state: present

    - name: Write the status page config
      ansible.builtin.copy:
        dest: /etc/nginx/conf.d/status.conf
        content: |
          server {
            listen {{ status_port }};
            location /status { return 200 "up\n"; }
          }
        mode: "0644"
      notify: Reload nginx

    - name: Start nginx
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true

    - name: Install tools
      ansible.builtin.package:
        name: "{{ item }}"
      loop:
        - git
        - jq

    - name: Open the status port
      ansible.posix.firewalld:
        port: "{{ status_port }}/tcp"
        permanent: true
        state: enabled
      when: ansible_os_family == "RedHat"

    - name: Show the port
      ansible.builtin.debug:
        msg: "Status page on port {{ status_port }}"

  handlers:
    - name: Reload nginx
      ansible.builtin.service:
        name: nginx
        state: reloaded
```

`hosts.ini` is the inventory. Use your server's address and user:

```ini
[web]
web1 ansible_host=203.0.113.10 ansible_user=admin
```

## Convert it

```sh
conn3x convert ansible -i hosts.ini -out web.circuit.hcl site.yml
```

```text
Converted 4 tasks. 2 things need you; each is marked TODO(convert):
  line 35, Open the status port: uses when, which the converter can't translate yet
  line 42, Show the port: uses the debug module, which has no Conn3x equivalent yet
```

The command exits with code `3` while anything is marked TODO, and `0` once everything converts. The line numbers point into `site.yml`.

## Read the result

Open `web.circuit.hcl`:

```hcl
# Converted from site.yml by conn3x convert ansible.
# Search for TODO(convert) to find what still needs a person.

variable "ssh_private_key_file" {
  type        = string
  description = "Private key Conn3x logs in with."
}

circuit "web" {
  hosts = {
    web1 = "203.0.113.10"
  }

  ssh {
    user             = "admin"
    private_key_file = var.ssh_private_key_file
    become           = true
  }

  step "install_nginx" {
    package {
      name = "nginx"
    }
  }

  step "write_the_status_page_config" {
    file {
      path    = "/etc/nginx/conf.d/status.conf"
      content = "server {\n  listen 8080;\n  location /status { return 200 \"up\\n\"; }\n}\n"
      mode    = "0644"
    }
    notify = [handler.reload_nginx]
  }

  step "start_nginx" {
    service {
      name    = "nginx"
      state   = "started"
      enabled = true
    }
  }

  step "install_tools" {
    for_each = ["git", "jq"]
    package {
      name = item.value
    }
  }

  # TODO(convert): Task "Open the status port" (site.yml line 35) uses when, which the converter can't translate yet.
  #   - name: Open the status port
  #     ansible.posix.firewalld:
  #       port: "{{ status_port }}/tcp"
  #       permanent: true
  #       state: enabled
  #     when: ansible_os_family == "RedHat"

  # TODO(convert): Task "Show the port" (site.yml line 42) uses the debug module, which has no Conn3x equivalent yet.
  #   - name: Show the port
  #     ansible.builtin.debug:
  #       msg: "Status page on port {{ status_port }}"

  handler "reload_nginx" {
    service {
      name   = "nginx"
      action = "reload"
    }
  }
}
```

Compare it with the playbook:

- The play became the circuit `web`. `hosts`, `user` and `become` came from the inventory and the play.
- Each task became a step named after it, in the same order. `dnf` became the [`package`](/modules/package) module, and `copy` became [`file`](/modules/file).
- `{{ status_port }}` was filled in from the play's `vars`, so the content says `8080`.
- `notify: Reload nginx` became `notify = [handler.reload_nginx]`, and the handler reloads instead of restarting, as `state: reloaded` did.
- The loop over a plain list became a step with [`for_each`](/reference/circuits/steps#for_each), one package per item.
- The key path became a variable, `ssh_private_key_file`, because an inventory doesn't usually say which key to use.

The commented-out tasks don't stop the file from validating. Check that now:

```sh
conn3x init
conn3x validate
```

```text
Success! The configuration is valid.
```

## Finish the TODOs

Each TODO says why the converter stopped. Decide what the task should mean in Conn3x, then replace the comment.

**Open the status port.** The `when` runs the task only on Red Hat family hosts. A Conn3x step runs on every host in the circuit, so the condition becomes a choice of which hosts the circuit covers. Every host in this inventory runs Rocky Linux, so the condition always holds, and the task becomes a plain [`firewalld`](/modules/firewalld) step. `permanent: true` and `state: enabled` need no counterpart: the `firewalld` module opens the port now and after reboots. Replace the first TODO with:

```hcl
  step "open_the_status_port" {
    firewalld {
      port = "8080/tcp"
    }
  }
```

If you had Debian hosts in the same group, you'd move them to a second circuit that uses [`ufw`](/modules/ufw) instead.

**Show the port.** A `debug` task prints a message during a run. Circuits configure hosts, and printing isn't a change to a host, so delete the second TODO. If you want the port in the output, add an [output value](https://opentofu.org/docs/language/values/outputs/).

The end of the circuit now reads:

```hcl
  step "install_tools" {
    for_each = ["git", "jq"]
    package {
      name = item.value
    }
  }

  step "open_the_status_port" {
    firewalld {
      port = "8080/tcp"
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

Validate again, and search for anything left:

```sh
conn3x validate
grep -n 'TODO(convert)' web.circuit.hcl
```

```text
Success! The configuration is valid.
2:# Search for TODO(convert) to find what still needs a person.
```

Only the header comment is left. Delete those two lines if you like.

## Apply

If you have a server for it, pass your key path and apply:

```sh
conn3x apply -var ssh_private_key_file=~/.ssh/id_ed25519
```

Type `yes`. The output here is shortened: Conn3x also prints each resource's ID, which starts with the server's address.

```text
conn3x_package.web__install_nginx["web1"]: Creating...
conn3x_package.web__install_nginx["web1"]: Creation complete after 2s
conn3x_file.web__write_the_status_page_config["web1"]: Creating...
conn3x_file.web__write_the_status_page_config["web1"]: Creation complete after 0s
conn3x_service.web__start_nginx["web1"]: Creating...
conn3x_service.web__start_nginx["web1"]: Creation complete after 0s
conn3x_package.web__install_tools["web1/jq"]: Creating...
conn3x_package.web__install_tools["web1/git"]: Creating...
conn3x_package.web__install_tools["web1/git"]: Creation complete after 4s
conn3x_package.web__install_tools["web1/jq"]: Creation complete after 5s
conn3x_firewalld.web__open_the_status_port["web1"]: Creating...
conn3x_firewalld.web__open_the_status_port["web1"]: Creation complete after 1s
conn3x_service_action.web__reload_nginx["web1"]: Creating...
conn3x_service_action.web__reload_nginx["web1"]: Creation complete after 0s

Apply complete! Resources: 7 added, 0 changed, 0 destroyed.
```

The `install_tools` step has one instance per host and item, `web1/git` and `web1/jq`. A second `conn3x plan` reports no changes.

## Clean up

```sh
conn3x destroy -var ssh_private_key_file=~/.ssh/id_ed25519
```

Type `yes`. Destroy ends with `Destroy complete! Resources: 7 destroyed.` and removes the steps from state. nginx, its configuration and the packages stay on the server. The `firewalld` step defaults to `on_remove = "delete"`, so destroy closes port 8080 again.

## Next steps

- [Migrate from Ansible](/guides/migrate-from-ansible) lists every module the converter handles and what it leaves for you.
- The [conn3x convert ansible](/reference/cli/convert-ansible) reference covers its options and exit codes.
- [Host facts](/reference/host-facts) read a host's OS at plan time, for a `when` that has to stay a condition.
