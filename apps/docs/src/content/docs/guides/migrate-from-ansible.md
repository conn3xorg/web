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

`copy`, `file` (directories and links), `lineinfile`, `blockinfile`, `package`, `dnf`, `yum`, `apt`, `service`, `systemd`, `systemd_service`, `user`, `group`, `authorized_key`, `cron`, `sysctl`, `hostname`, `timezone`, `firewalld`, `ufw`, `seboolean`, `sefcontext`, `get_url`, `unarchive`, `git`, `mount`, `apt_repository`, `yum_repository`, `ini_file`, `replace`, `known_hosts`, `pam_limits`, `pip`, `command`, `shell` and `wait_for`, with or without their collection prefix.

`apt_repository`, `yum_repository`, `ini_file` and `replace` arrived in v0.6.10, and each converts only as far as it can be proved the same. A repository needs its signing key saved beside the playbook. A `replace` pattern using `\d`, `\w` or `\s` stays for review, because Python and Go read them differently, so rewrite `\d` as `[0-9]` and convert again.

New in v0.6.11, `known_hosts` becomes a [known_hosts](/modules/known_hosts#from-ansible) step and `pam_limits` a [limit](/modules/limit#from-ansible) step. Some of each stay for review, and their pages say which.

New in v0.6.12, `ansible.builtin.pip` with a `virtualenv` becomes a [pip](/modules/pip#from-ansible) step, one for each name. Without a `virtualenv` it stays for review, since a `pip` step doesn't install system-wide. So does `requirements`: that file is on the host, where the converter can't see what it pins, so give each package a step with its version.

New in v0.7.0, a `copy` task's `validate` carries over to the [file](/modules/file#from-ansible) step, minus any quotes around `%s`. Ansible runs `validate` without a shell, and Conn3x runs it through `sh`, so one with a pipe, a redirect, `$`, a glob or a second line stays for review.

### Windows

Also new in v0.7.0, Windows tasks convert into the [Windows modules](/modules/windows_file), which are [experimental](/reference/maturity#preview-and-experimental-together):

- From `ansible.windows`: `win_acl`, `win_acl_inheritance`, `win_command`, `win_copy`, `win_feature`, `win_file`, `win_group`, `win_group_membership`, `win_package`, `win_powershell`, `win_regedit`, `win_service`, `win_shell`, `win_user` and `win_wait_for`.
- From `community.windows`: `win_firewall_rule`, `win_iis_webapppool`, `win_iis_website` and `win_scheduled_task`.
- From `microsoft.iis`, which replaces the community IIS modules: `web_app_pool` and `website`.

As on Linux, the collection prefix is optional. `win_command` and `win_shell` become [windows_powershell](/modules/windows_powershell) steps with a review note above them, because PowerShell can read a command line differently from how `win_command` ran it. A `win_package` needs a SHA-256 for its MSI, or it stays for review.

Every converted IIS site gets a `TODO(convert)` note. Apply refuses a [windows_iis_site](/modules/windows_iis_site) whose `physical_path` anyone but administrators can change, and a new folder under `C:\inetpub` or at the top of `C:`, with only inherited rules, is one of those. The note says what to give its [windows_directory](/modules/windows_directory) step: full control for SYSTEM and Administrators, and read for IIS_IUSRS and IUSR. A `win_iis_website` gets a second note, because Ansible used `port`, `ip` and `hostname` only when it made the site, and in Conn3x they're the site's whole list of bindings.

New in v0.7.1, a playbook that builds a domain controller comes across too. `microsoft.ad.domain`, by that full name, and `win_domain` become a [windows_ad_forest](/modules/windows_ad_forest) step, with a `TODO(convert)` for the Directory Services Restore Mode password: the task's own is never copied, so set `safe_mode_password_wo` from an ephemeral variable. With `reboot: true` you also get a [windows_reboot](/modules/windows_reboot) step and a wait on port 9389, since sshd answers long before AD does. `install_dns: false`, `domain_mode` and `forest_mode` stay for review. `win_dns_client` becomes a [windows_dns_client](/modules/windows_dns_client) step when it names one adapter exactly; a wildcard, several adapters or a reset to DHCP stay for review.

Since v0.7.2 the rest of the domain comes across as well. `microsoft.ad.membership` and `win_domain_membership` become a [windows_domain_membership](/modules/windows_domain_membership) step, and `microsoft.ad.domain_controller` and `win_domain_controller` a [windows_ad_domain_controller](/modules/windows_ad_domain_controller) step. The `microsoft.ad` names need their full collection prefix, like `microsoft.ad.domain`. `domain_admin_user` becomes `username`, and no password is ever copied: a `TODO(convert)` asks you to set `password_wo`, and on a domain controller `safe_mode_password_wo` too, from ephemeral variables. `reboot: true` adds a [windows_reboot](/modules/windows_reboot) step, and after a promotion the same wait on port 9389. A join's `domain_ou_path` becomes `ou`.

Some tasks still stay for review, each with the reason. Leaving a domain or demoting a controller won't convert, because Conn3x never does either. Neither will an offline join blob, a rename while joining, `domain_server`, a read-only domain controller, a promotion without DNS, or `site_name`, `install_media_path` and `replication_source_dc`. A task without `domain_admin_user` stays too, since both modules join or promote with a named account.

You won't get a step for `debug`, since all it does is print. The task is dropped, and a comment in its place says so. What it printed isn't copied, because a debug message can hold a secret. A `debug` with a `when` or a `register` stays as a TODO, and its contents stay out of that comment too.

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

- **`locale_gen`.** A [locale](/modules/locale) step also sets the host's `LANG`, which `locale_gen` doesn't.
- **Anything under `no_log`.** Its values would land in the file, so they're left out of the comment too. That includes a `no_log` set on the block or the play.
- **Control flow:** `with_*`, `when`, `register`, `ignore_errors`, `until` and similar, and any `loop` other than a plain list. A `when` becomes a choice of which hosts the circuit covers, made at plan time, and a loop over a variable or over items with fields becomes a step with [`for_each`](/reference/circuits/steps#for_each) that you write. These need a person.
- **Jinja templates and filters.** Rewrite templates in `templatefile` syntax (`${var}`, `%{ if }`) and use a [template](/modules/template) step.
- **`win_template`.** Rewrite it in `templatefile` syntax for a [windows_file](/modules/windows_file) step, which writes line endings as they are, where `win_template` defaults to CRLF.
- **Commands and reboots that ran on every play.** A Conn3x step runs when something is out of date, so it needs a `creates`, `removes` or `unless` guard, or `triggers`, to know when. That includes every `win_reboot`: a [windows_reboot](/modules/windows_reboot) step reboots once, then again when its `triggers` change, or with `only_if_pending`.
- **`get_url` without a sha256 checksum.** Conn3x only downloads what it can verify.
- **A `file` link that sets `owner`, `group` or `mode`.** A Conn3x [link](/modules/link) step doesn't manage those, so the converter won't quietly drop them.
- **Arguments it doesn't know.** Rather than drop an argument and change behaviour silently, it leaves the whole task.

The command exits 3 while anything is left, so you can keep running it in CI until the count reaches zero.

Your servers already look the way the playbook left them. To take them over without Conn3x setting everything up again, add `import = true` to the steps: see [Adopt servers you already run](/guides/adopt-servers).

Still deciding? [Conn3x vs Ansible](/compare/ansible) runs the same playbook both ways, and says where Ansible is the better choice.
