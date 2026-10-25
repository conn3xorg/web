---
title: Migrate from Ansible
description: Convert a playbook into circuits with conn3x convert ansible, and finish what it leaves.
---

`conn3x convert ansible` reads a playbook and writes circuits. It converts the tasks it can show mean the same thing in Conn3x, and leaves every other task in the output, commented out, with the reason, so nothing is lost in translation.

```sh
conn3x convert ansible -out site.tf site.yml
```

```text
Converted 9 of 11 tasks. 2 need you; each is marked TODO(convert):
  line 64, Users from a list: uses loop, which the converter can't translate yet
  line 69, Say hello: uses the debug module, which has no Conn3x equivalent yet
```

Write the output next to the playbook: when a task copies a file from `files/`, the circuit reads it from the same place.

## What you get

- One circuit per play, with `become` carried over.
- A `variable "<group>_hosts"` for each `hosts:` group. Set it to a map of host name to address, for example in `terraform.tfvars`, until inventory conversion arrives.
- `ssh_user` and `ssh_private_key_file` variables for the `ssh` block.
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

`blockinfile` keeps Ansible's `ANSIBLE MANAGED BLOCK` marker, so Conn3x takes over the blocks Ansible already wrote instead of adding second copies.

## What it leaves for you

Each of these stays as commented YAML under a `# TODO(convert)` line:

- **Control flow:** `loop` and `with_*`, `when`, `register`, `ignore_errors`, `until` and similar. Circuits express repetition with HCL (`for_each`, `for` expressions) and decisions at plan time, so these need a person.
- **Jinja templates and filters.** Rewrite templates in `templatefile` syntax (`${var}`, `%{ if }`) and use a [template](/modules/template) step.
- **Commands and reboots that ran on every play.** A Conn3x step runs when something is out of date, so it needs a `creates`, `removes` or `unless` guard, or `triggers`, to know when.
- **`get_url` without a sha256 checksum.** Conn3x only downloads what it can verify.
- **Arguments it doesn't know.** Rather than drop an argument and change behaviour silently, it leaves the whole task.

The command exits 3 while anything is left, so you can keep running it in CI until the count reaches zero.
