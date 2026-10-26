---
title: conn3x convert ansible
description: Convert an Ansible playbook into circuits.
---

`conn3x convert ansible` reads an Ansible playbook and writes the equivalent circuits. Tasks it can show mean the same thing become steps. Every other task stays in the output as commented-out YAML under a `TODO(convert)` line that says why, for you to finish by hand.

This command is Conn3x only. For what it converts and how to finish the rest, see [Migrate from Ansible](/guides/migrate-from-ansible).

## Usage

```sh
conn3x convert ansible [options] PLAYBOOK
```

`PLAYBOOK` is required. Options can come before or after it.

The circuits go to standard output, or to the file you name with `-out`. A summary goes to standard error, so redirecting standard output captures only the circuits.

## Options

| Option | Description |
| --- | --- |
| `-i=FILE` | An INI or YAML inventory. Each circuit's `hosts`, and the `ssh` block's `user` and `port`, come from it. |
| `-inventory=FILE` | The same as `-i`. |
| `-out=FILE` | Write the circuits to `FILE` instead of standard output. An existing file is overwritten. |

Without `-i`, the output declares variables for you to set instead: a `<group>_hosts` map for each group, and `ssh_user`. It always declares `ssh_private_key_file`.

Write the output next to the playbook. A converted `copy` task reads its source from the same relative path the playbook used.

## Example

`site.yml`:

```yaml
- hosts: web
  become: true
  tasks:
    - name: Install nginx
      ansible.builtin.package:
        name: nginx
        state: present
    - name: Start nginx
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true
    - name: Do something odd
      ansible.builtin.shell: echo hi | tee /tmp/x
      register: out
```

`hosts.ini`:

```ini
[web]
web1 ansible_host=203.0.113.10 ansible_user=deploy
```

```sh
conn3x convert ansible -i hosts.ini -out web.circuit.hcl site.yml
```

Standard error:

```text
Converted 2 tasks. 1 thing needs you; each is marked TODO(convert):
  line 13, Do something odd: uses register, which the converter can't translate yet
```

`web.circuit.hcl`:

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
    user             = "deploy"
    private_key_file = var.ssh_private_key_file
    become           = true
  }

  step "install_nginx" {
    package {
      name = "nginx"
    }
  }

  step "start_nginx" {
    service {
      name    = "nginx"
      state   = "started"
      enabled = true
    }
  }

  # TODO(convert): Task "Do something odd" (site.yml line 13) uses register, which the converter can't translate yet.
  #   - name: Do something odd
  #     ansible.builtin.shell: echo hi | tee /tmp/x
  #     register: out
}
```

When every task converts, the summary is one line:

```text
Converted all 9 tasks.
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Every task converted. |
| 1 | An error, such as a missing playbook, YAML that isn't valid, or an inventory that can't be read. |
| 3 | The output was written, and some tasks are marked `TODO(convert)`. |

Exit code 3 lets a CI job fail until nothing is left to finish.
