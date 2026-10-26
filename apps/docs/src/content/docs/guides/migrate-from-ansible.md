---
title: Migrate from Ansible
description: Convert a playbook into circuits with conn3x convert ansible, and finish what it leaves.
---

`conn3x convert ansible` reads a playbook and writes circuits. It converts the tasks it can show mean the same thing in Conn3x, and leaves every other task in the output, commented out, with the reason, so nothing is lost in translation.

```sh
conn3x convert ansible -i inventory.ini -out site.tf site.yml
```

```text
Converted 9 tasks. 2 things need you; each is marked TODO(convert):
  line 64, Users from a list: uses loop, which the converter can't translate yet
  line 69, Say hello: uses the debug module, which has no Conn3x equivalent yet
```

Write the output next to the playbook: when a task copies a file from `files/`, the circuit reads it from the same place.

## What you get

- One circuit per play, with `become` carried over.
- Each circuit's `hosts`, read from the inventory you pass with `-i`: the play's group and its children, at `ansible_host` where it's set. INI and YAML inventories both work.
- The `ssh` block's `user` and `port`, from `ansible_user` and `ansible_port`, when every host in the group agrees on them. If they don't, the circuit says so under a `TODO(convert)` line, because a circuit logs in to all its hosts the same way.
- Without `-i`, a `variable "<group>_hosts"` for each group instead, for you to set in `terraform.tfvars`, and an `ssh_user` variable. There's always an `ssh_private_key_file` variable.
- A step per task, named after the task, and handlers for the service restarts and reloads your tasks notify.
- Simple `{{ var }}` references to the play's `vars` filled in.

```hcl
step "write_the_home_page" {
  file {
    path    = "/usr/share/nginx/html/index.html"
    content = "<h1>Hello</h1>\n"
    mode    = "0644"
  }
  notify = [handler.reload_nginx]
}
```

## Modules it converts

`copy`, `file` (directories and links), `lineinfile`, `blockinfile`, `package`, `dnf`, `yum`, `apt`, `service`, `systemd`, `user`, `group`, `authorized_key`, `cron`, `sysctl`, `hostname`, `timezone`, `firewalld`, `ufw`, `seboolean`, `sefcontext`, `get_url`, `unarchive`, `git`, `mount`, `command`, `shell` and `wait_for`, with or without their collection prefix.

A task with `loop:` over a plain list in the playbook, using `{{ item }}`, becomes a [repeated step](/reference/circuits/steps#for_each):

```hcl
step "tools" {
  for_each = ["git", "jq"]
  package {
    name = item.value
  }
}
```

`blockinfile` keeps Ansible's `ANSIBLE MANAGED BLOCK` marker, so Conn3x takes over the blocks Ansible already wrote instead of adding second copies.

## What it leaves for you

Each of these stays as commented YAML under a `# TODO(convert)` line:

- **Control flow:** `with_*`, `when`, `register`, `ignore_errors`, `until` and similar, and any `loop` other than a plain list. A `when` becomes a choice of which hosts the circuit covers, made at plan time, and a loop over a variable or over items with fields becomes a step with [`for_each`](/reference/circuits/steps#for_each) that you write. These need a person.
- **Jinja templates and filters.** Rewrite templates in `templatefile` syntax (`${var}`, `%{ if }`) and use a [template](/modules/template) step.
- **Commands and reboots that ran on every play.** A Conn3x step runs when something is out of date, so it needs a `creates`, `removes` or `unless` guard, or `triggers`, to know when.
- **`get_url` without a sha256 checksum.** Conn3x only downloads what it can verify.
- **Arguments it doesn't know.** Rather than drop an argument and change behaviour silently, it leaves the whole task.

The command exits 3 while anything is left, so you can keep running it in CI until the count reaches zero.
