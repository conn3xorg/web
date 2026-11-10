---
title: conn3x convert ansible
description: Convert an Ansible playbook into circuits, or a role into a circuit directory.
---

`conn3x convert ansible` reads an Ansible playbook and writes the equivalent circuits. Tasks it can show mean the same thing become steps. Every other task stays in the output as commented-out YAML under a `TODO(convert)` line that says why, for you to finish by hand.

This command is Conn3x only. For what it converts and how to finish the rest, see [Migrate from Ansible](/guides/migrate-from-ansible).

## Usage

```sh
conn3x convert ansible [options] PLAYBOOK
conn3x convert ansible -role ROLE -out DIR
```

`PLAYBOOK` is required, unless you give `-role`. Options can come before or after it.

With `-role`, it converts one role's directory into a new circuit directory, which `-out` names. Nothing is downloaded: a role from Ansible Galaxy works once you've installed it with `ansible-galaxy`. `-role` is in Conn3x since v0.9.0. [Convert a role](/guides/migrate-from-ansible#convert-a-role) shows what goes in and what comes out.

The circuits go to standard output, or to the file you name with `-out`. A summary goes to standard error, so redirecting standard output captures only the circuits. Since v0.11.0 the summary lists notes on converted steps, such as a crontab line to delete once, under a heading of their own. They don't change the exit code.

With `-out`, each role a play runs, from its `roles:` list or an `include_role` or `import_role` in its tasks, converts from `roles/` beside the playbook into a circuit directory beside the output file, along with the dependencies in its `meta/main.yml`. The output calls each as a `module`, in the order Ansible runs them. This is new in v0.11.0. [Roles a play runs](/guides/migrate-from-ansible#roles-a-play-runs) shows the output.

## Options

| Option | Description |
| --- | --- |
| `-i=FILE` | An INI or YAML inventory. Each circuit's `hosts`, and the `ssh` block's `user` and `port`, come from it. |
| `-inventory=FILE` | The same as `-i`. |
| `-out=FILE` | Write the circuits to `FILE` instead of standard output. An existing file is overwritten, and since v0.12.0 a link at that path is replaced, not written through. Since v0.11.0, the roles the playbook runs are written beside it, each as a circuit directory, and a directory that already has files is kept as it is. With `-role`, the new directory to write the circuit to. |
| `-role=DIR` | Convert the Ansible role in `DIR` into a circuit directory. Needs `-out`. |

Without `-i`, the output declares variables for you to set instead: a `<group>_hosts` map for each group, and `ssh_user`. It always declares `ssh_private_key_file`.

Since v0.12.0 the converter refuses a file with a NUL byte, whether it's a playbook, a role file or an inventory. It also stops with an error, instead of hanging, on imports that multiply without end and on an inventory group that contains itself.

The summary shows control characters in playbook text as escapes, and the tasks it echoes leave out arguments named like secrets, such as `password`, `token`, `passphrase`, `api_key` and `private_key`.

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
