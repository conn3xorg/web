---
title: Migrate from Ansible
description: Convert a playbook into circuits with conn3x convert ansible, and finish what it leaves.
---

`conn3x convert ansible` reads a playbook and writes circuits. It converts the tasks it can show mean the same thing in Conn3x, and leaves every other task in the output, commented out, with the reason, so nothing is lost in translation.

```sh
conn3x convert ansible -i inventory.ini -out site.tf site.yml
```

```text
Converted 11 tasks. 1 thing needs you; each is marked TODO(convert):
  line 72, Check the disk: uses the stat module, which has no Conn3x equivalent yet
```

Write the output next to the playbook: when a task copies a file from `files/`, the circuit reads it from the same place.

Some steps convert cleanly and still need you once, such as the `#Ansible:` job a converted `cron` task leaves behind in the crontab. Since v0.11.0 those get their own heading in the summary, and a `TODO(convert)` line in the file. They don't change the exit code, because they're written on every run:

```text
Converted 11 tasks. 1 thing needs you; each is marked TODO(convert):
  line 72, Check the disk: uses the stat module, which has no Conn3x equivalent yet
1 converted step has a note to act on once, also marked TODO(convert):
  line 52, Nightly cleanup: Delete the "#Ansible: clean tmp" job Ansible left in the user's crontab, or it runs twice.
```

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

Since v0.12.0, database tasks convert too. `community.postgresql.postgresql_db` and `postgresql_user` become [postgresql_database](/modules/postgresql_database) and [postgresql_role](/modules/postgresql_role) steps, and `become_user: postgres` on the task is allowed. `community.mysql.mysql_db` and `mysql_user` become [mysql_database](/modules/mysql_database) and [mysql_user](/modules/mysql_user) steps, with the database-level parts of `priv` as `grants`. A password is never copied: a `TODO(convert)` asks you to set `password_wo`. Drops, dumps and imports, `login_*` options, table and global privileges, and `append_privs` stay for review.

Since v0.14.0, a `postgresql_user` task with `db` and a database-level `priv` such as `CONNECT/TEMP` gives its role `database_grants`. A note goes with it, because in Conn3x that list is the role's whole set of grants on the database, where Ansible only added to them. `postgresql_privs`, `priv` on single tables and `grant_option` still stay for review.

Also new in v0.14.0: an `authorized_key` task with `exclusive: true` becomes an [authorized_key](/modules/authorized_key) step with `exclusive = true`, so the user's keys are exactly the ones it lists. A `file` task with `recurse: yes` becomes a [directory](/modules/directory) step with `recurse = true` when its `mode` is symbolic, such as `u=rwX,g=rX,o=`, or when it sets only `owner` and `group`. A numeric `mode` with `recurse` stays for review, because the directories need the execute bit and a numeric mode would give it to every file under them too.

A `cron` task still becomes a [cron](/modules/cron) step, which keeps the job in `/etc/cron.d`. If you'd rather the jobs stay in the user's own crontab, the one `crontab -e` edits, move them into one [crontab](/modules/crontab) step for that user, new in v0.14.0. It owns the whole file, so list every job the user should keep.

New in v0.7.0, a `copy` task's `validate` carries over to the [file](/modules/file#from-ansible) step, minus any quotes around `%s`. Ansible runs `validate` without a shell, and Conn3x runs it through `sh`, so one with a pipe, a redirect, `$`, a glob or a second line stays for review.

### Windows

Since v0.7.0, Windows tasks convert into the [Windows modules](/modules/windows_file), 15 of which have left [experimental](/reference/maturity#preview-and-experimental-together) since v0.15.0. These tasks convert:

- From `ansible.windows`: `win_acl`, `win_acl_inheritance`, `win_command`, `win_copy`, `win_feature`, `win_file`, `win_group`, `win_group_membership`, `win_package`, `win_powershell`, `win_regedit`, `win_service`, `win_shell`, `win_user` and `win_wait_for`.
- From `community.windows`: `win_firewall_rule`, `win_iis_webapppool`, `win_iis_website` and `win_scheduled_task`.
- From `microsoft.iis`, which replaces the community IIS modules: `web_app_pool` and `website`.

As on Linux, the collection prefix is optional. `win_command` and `win_shell` become [windows_powershell](/modules/windows_powershell) steps with a review note above them, because PowerShell can read a command line differently from how `win_command` ran it. A `win_package` needs a SHA-256 for its MSI, or it stays for review.

Every converted IIS site gets a `TODO(convert)` note. Apply refuses a [windows_iis_site](/modules/windows_iis_site) whose `physical_path` anyone but administrators can change, and a new folder under `C:\inetpub` or at the top of `C:`, with only inherited rules, is one of those. The note says what to give its [windows_directory](/modules/windows_directory) step: full control for SYSTEM and Administrators, and read for IIS_IUSRS and IUSR. A `win_iis_website` gets a second note, because Ansible used `port`, `ip` and `hostname` only when it made the site, and in Conn3x they're the site's whole list of bindings.

New in v0.7.1, a playbook that builds a domain controller comes across too. `microsoft.ad.domain`, by that full name, and `win_domain` become a [windows_ad_forest](/modules/windows_ad_forest) step, with a `TODO(convert)` for the Directory Services Restore Mode password: the task's own is never copied, so set `safe_mode_password_wo` from an ephemeral variable. With `reboot: true` you also get a [windows_reboot](/modules/windows_reboot) step and a wait on port 9389, since sshd answers long before AD does. `install_dns: false`, `domain_mode` and `forest_mode` stay for review. `win_dns_client` becomes a [windows_dns_client](/modules/windows_dns_client) step when it names one adapter exactly; a wildcard, several adapters or a reset to DHCP stay for review.

Since v0.7.2 the rest of the domain comes across as well. `microsoft.ad.membership` and `win_domain_membership` become a [windows_domain_membership](/modules/windows_domain_membership) step, and `microsoft.ad.domain_controller` and `win_domain_controller` a [windows_ad_domain_controller](/modules/windows_ad_domain_controller) step. The `microsoft.ad` names need their full collection prefix, like `microsoft.ad.domain`. `domain_admin_user` becomes `username`, and no password is ever copied: a `TODO(convert)` asks you to set `password_wo`, and on a domain controller `safe_mode_password_wo` too, from ephemeral variables. `reboot: true` adds a [windows_reboot](/modules/windows_reboot) step, and after a promotion the same wait on port 9389. A join's `domain_ou_path` becomes `ou`.

Since v0.12.0, `microsoft.ad.domain_child` becomes a [windows_ad_domain](/modules/windows_ad_domain) step, with the same reboot and wait when it sets `reboot: true`. `domain_admin_user` has to name its domain by its DNS name, such as `admin@lab.example.com`, as the step needs. A new tree, `domain_mode` and `site_name` stay for review, and no password is copied.

Some tasks still stay for review, each with the reason. Leaving a domain or demoting a controller won't convert, because Conn3x never does either. Neither will an offline join blob, a rename while joining, `domain_server`, a read-only domain controller, a promotion without DNS, or `site_name`, `install_media_path` and `replication_source_dc`. A task without `domain_admin_user` stays too, since both modules join or promote with a named account.

New in v0.7.3, so do the things you keep in a domain. `microsoft.ad.ou` becomes a [windows_ad_ou](/modules/windows_ad_ou) step, `microsoft.ad.group` and `win_domain_group` a [windows_ad_group](/modules/windows_ad_group) step, and `microsoft.ad.user` and `win_domain_user` a [windows_ad_user](/modules/windows_ad_user) step. Again the `microsoft.ad` names need their full prefix. A group's `members.add` list comes across as members that are only added, and `members.set` as the whole list, with `authoritative = true`. A user's password is never copied: a `TODO(convert)` asks you to set `password_wo` from an ephemeral variable.

Since v0.12.0, `win_updates` becomes a [windows_update](/modules/windows_update) step. Categories match the way Ansible matches them, accept and reject lists made only of KB numbers carry over, and `reboot: true` adds a [windows_reboot](/modules/windows_reboot) step that waits Ansible's 1200 seconds. One difference matters: Ansible kept installing and rebooting until nothing was left, and Conn3x installs one round on each apply.

These stay for review, with the reason:

- `state: absent`. Removing a step forgets the object, and deletes it only with `on_remove = "delete"`, so there's no step that means "delete this".
- `domain_server`, `domain_username`, `domain_password` or `domain_credentials`. Conn3x runs these steps on a domain controller, as its own login.
- `identity`, used to rename or move an object, and a `sam_account_name` that isn't the same as `name`, since Conn3x uses one name for both.
- `members.remove`, and a member named any way but its sAMAccountName: a distinguished name, `DOMAIN\name`, a UPN or a SID.
- A user's `groups`. Put the user in each group's `members` instead.
- `state: query` on a user, which only looks.

You won't get a step for `debug`, since all it does is print. The task is dropped, and a comment in its place says so. What it printed isn't copied, because a debug message can hold a secret. A `debug` with a `when` or a `register` stays as a TODO, and its contents stay out of that comment too.

Since v0.7.3, `ping` goes the same way. Conn3x connects to every host before it does anything, so a task that only checks the connection has nothing left to do. Two kinds stay for review: `data: crash`, which fails the task on purpose to stop the play, and `data` from a template, which could turn out to be `crash`.

`setup`, `service_facts` and `package_facts` are dropped too, since they only gather facts. If a later task in the play, or one of its handlers, reads those facts, the note says so, and that task stays for review. A step can't read Ansible's facts, so check what the task did with them. [Host facts](/reference/host-facts) are the Conn3x way to read a host's OS at plan time.

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
- **A `command` task with shell characters,** such as `;`, `|`, `$`, `*` or `>`. Ansible runs `command` without a shell and a [command](/modules/command) step runs through one, so since v0.12.0 the converter doesn't guess which you meant.
- **Anything tagged `never`.** Ansible runs it only when you ask for one of its tags, and a step would run on every apply. That covers a task, a handler, an import, a role call or a whole play.
- **A value encrypted with Ansible Vault.** The converter can't read it and won't write the ciphertext into a circuit, so a task that uses one stays. Since v0.16.0 its TODO says how to move the secret to a [SOPS file](/reference/circuits/secrets#sops-files), which `conn3x_secrets` reads without it ever reaching state. An [ephemeral variable](/reference/circuits/secrets#ephemeral-variables) works too.
- **A `src` outside the playbook's or role's directory,** or one that's a link. The converter reads only the files that came with the playbook.
- **A block that sets `when`, `become` or another keyword,** which would apply to every task inside it, and a block with `rescue` or `always` inside another block's. So does a rescue task that reads `ansible_failed_task` or `ansible_failed_result`, or that notifies a handler.
- **Arguments it doesn't know.** Rather than drop an argument and change behaviour silently, it leaves the whole task.

Since v0.12.0 the converter also tells you what it couldn't carry over from the play itself. Keywords such as `check_mode`, `connection`, `module_defaults`, `environment`, `run_once`, `vars_prompt` and `vars_files` are listed at the top of the circuit. And a `copy` or `template` task without `mode` gets a note, because the step sets `0644` where Ansible left an existing file's mode alone.

The command exits 3 while anything is left, so you can keep running it in CI until the count reaches zero.

Your servers already look the way the playbook left them. To take them over without Conn3x setting everything up again, add `import = true` to the steps: see [Adopt servers you already run](/guides/adopt-servers).

## Where Ansible's options went

Some of what you set on a play, a task or the `ansible-playbook` command line has a Conn3x equivalent. Since v0.15.0:

| Ansible | Conn3x |
| --- | --- |
| `delegate_to: lb` on a task | [`on = "lb"`](/reference/circuits/steps#on) on the step. Each host keeps its own step, and it runs over `lb`'s connection. The converter writes it for you when `delegate_to` names a host. |
| `delegate_to: localhost` on a task | [`on = "controller"`](/reference/circuits/steps#on-the-controller), on a `command` step. It runs on your machine, as you, without sudo. The converter writes it for `command` and `shell` tasks; other modules on the controller stay for review. Templated names stay for review too. |
| `group_vars/` and `host_vars/` | Read with the inventory, by `-i` and by `inventory()`. Since v0.16.0, a `{{ var }}` every host in the play shares becomes its value in the step; one that differs by host stays for review. |
| An inventory file | [`hosts = provider::conn3x::inventory("inventory.ini", "web")`](/reference/circuits/hosts#from-an-ansible-inventory), which reads a group's hosts, ports, users and variables from it. New in v0.16.0. |
| `ansible-playbook --limit 'web*'` | [`conn3x plan -limit='web*'`](/reference/cli/plan#-limit), or the same on `apply` and `refresh`. The pattern syntax is Ansible's, without groups. |
| `serial: 2` or `serial: "20%"` on a play | [`batch_size = 2`](/reference/cli/apply#batches) or `"20%"` on a circuit with `strategy = "per_host"`. The converter writes both. A list or templated `serial` goes to review. |
| `max_fail_percentage` | [`max_failures = "20%"`](/reference/cli/apply#batches). Ansible counts it in each batch, and Conn3x over every host that changes, rounded down. The converter writes it, with a comment saying so. |
| `block` with `rescue` and `always` | The block's tasks become steps in its place, the `rescue` tasks become [`rescue`](/reference/circuits/rescues) blocks and the `always` tasks [`always`](/reference/circuits/rescues#always) blocks, each watching the block's steps. A block nested inside another flattens into it. The converter writes these since v0.16.0. |

## Convert a role

Since v0.9.0 there's `-role`. Point it at a role's directory, and `-out` at a new one, and you get a circuit laid out like the ones in [the catalogue](/circuits), ready to call as a module.

Since v0.16.0, `-role` also takes a role straight from Galaxy, so there's no `ansible-galaxy install` first:

```sh
conn3x convert ansible -role geerlingguy.nginx,3.3.1 -out circuit-nginx
```

Leave off the version to get the newest one Galaxy lists. Conn3x downloads the role from GitHub, as `ansible-galaxy` does, converts it from a temporary directory, and adds a "Source" section to the circuit's README naming the role, the version and the repository. A directory with the same name on disk is used instead. Collections aren't downloaded; their roles come with the collection.

```sh
conn3x convert ansible -role roles/app -out circuit-app
```

```text
Converted all 7 tasks.
```

Here's the role going in, and what comes out:

```text
roles/app/                  circuit-app/
  defaults/main.yml           main.circuit.hcl
  vars/main.yml               variables.tf
  tasks/main.yml              outputs.tf
  tasks/install.yml           README.md
  handlers/main.yml           files/app.service
  templates/app.conf.j2       templates/app.conf.tftpl
  files/app.service
  meta/main.yml
```

- `tasks/main.yml` becomes the steps, with any `import_tasks` read in where it sits. `handlers/main.yml` becomes the handlers.
- Each default in `defaults/main.yml` becomes a variable with that default, so you set it where you call the circuit, as a play would.
- `vars/main.yml` is filled in where it's used. In Ansible a role's vars beat anything the play sets, so the circuit doesn't let a caller change them either.
- A template that only prints variables with `{{ name }}` becomes a `.tftpl` file and a [template](/modules/template) step. The files your tasks copy come along into `files/`.
- `variables.tf` starts with the `hosts` and `ssh_` variables every circuit in the catalogue takes, so you call this one the same way.

This default and task:

```yaml
# defaults/main.yml
app_user: app

# tasks/main.yml
- name: App config
  ansible.builtin.template:
    src: app.conf.j2
    dest: "{{ app_dir }}/app.conf"
    owner: "{{ app_user }}"
    mode: "0640"
  notify: Restart app
```

come out as:

```hcl
variable "app_user" {
  type        = string
  default     = "app"
  description = "From the role's defaults/main.yml."
}

step "app_config" {
  template {
    source      = "${path.module}/templates/app.conf.tftpl"
    destination = "/opt/app/app.conf"
    vars = {
      app_dir      = "/opt/app"
      app_greeting = var.app_greeting
      app_port     = var.app_port
      app_user     = var.app_user
    }
    mode  = "0640"
    owner = var.app_user
  }
  notify = [handler.restart_app]
}
```

`app_dir` came from `vars/main.yml`, so it's written in. The template's `{{ app_port }}` is now `${app_port}`, and a `${` that was already in it is escaped, so it still prints as written.

Then call it like any other circuit:

```hcl
module "app" {
  source = "./circuit-app"

  hosts = {
    web1 = "203.0.113.10"
  }

  ssh_private_key_file = "~/.ssh/id_ed25519"
  app_greeting         = "Hello from Conn3x"
}
```

### Roles a play runs

Most playbooks are a list of roles. Since v0.11.0, converting one with `-out` converts the roles too. Each role the play runs, from its `roles:` list or from an `include_role` or `import_role` in its tasks (since v0.13.0, also one in a file the play pulls in with `import_tasks`), is read from `roles/` beside the playbook and written to a circuit directory beside the output file. The output calls each one as a `module`, in the order Ansible runs it:

```sh
conn3x convert ansible -i inventory.ini -out site.tf site.yml
```

```hcl
circuit "web" {            # pre_tasks
  ...
}

module "web" {
  source = "./circuit-web"

  hosts                = var.web_hosts
  ssh_user             = var.ssh_user
  ssh_private_key_file = var.ssh_private_key_file
  ssh_become           = true

  web_port = 8080          # the play's vars beat the role's defaults

  depends_on = [conn3x_package.web__install_curl]
}

circuit "web_2" {          # tasks, after the role
  ...
}
```

- **Order.** Ansible runs `pre_tasks`, then `roles`, then `tasks`, then `post_tasks`. The play splits around each role call, and each part waits for the one before it with `depends_on`.
- **Vars.** The play's `vars` and the call's own `vars` become module inputs wherever the role's circuit has a variable for them, and the call's value wins, as in Ansible. A var with nowhere to go gets a `TODO(convert)`.
- **`become`** on the call sets `ssh_become`.
- **Dependencies.** A role's `meta/main.yml` dependencies convert the same way and run before it, with the vars `meta/` gives them. As in Ansible, a role that already ran with the same vars doesn't run again, while `include_role` always runs. A dependency that can't convert, or a cycle, stays for review.
- **`when` on the OS family,** such as `when: ansible_os_family == 'Debian'`, filters the hosts the module gets, using `os_family` from a `conn3x_host` data source.
- **Part of a role.** Since v0.12.0, `include_role` and `import_role` take `tasks_from`, `vars_from`, `defaults_from` and `handlers_from`. The role converts again from those files into its own circuit directory, such as `circuit-web-install` for `tasks_from: install`.
- **A role in a loop.** Also since v0.12.0, `include_role` with `loop` over a plain list becomes one module per item, each waiting for the one before, as Ansible runs them in order. The role converts into `circuit-<role>-each`, where the loop variable is a required input.
- **Reuse and re-runs.** A role called twice converts once and gets two module blocks. A `circuit-<role>/` directory that already has files is kept as it is, and the summary says so, so converting again never writes over your edits.

### Roles from Ansible Galaxy

The converter never downloads anything. Install the role with `ansible-galaxy`, which already handles versions, private servers and collection signatures, then convert the copy on your disk:

```sh
ansible-galaxy role install <namespace>.<role> -p roles
conn3x convert ansible -role roles/<namespace>.<role> -out circuit-<role>
```

The circuit takes the name after the dot. For a role inside a collection, point `-role` at `ansible_collections/<namespace>/<collection>/roles/<role>` wherever `ansible-galaxy collection install` put it.

`-out` has to be a new or empty directory, so converting again never writes over a circuit you've started editing.

### What a role leaves for you

Everything a playbook leaves, plus:

- **A default where its value needs checking first,** such as a path or a mode. In a playbook the converter can check the value it sees; in a role, whoever calls the circuit can set anything. So a default stays a variable only where Conn3x uses it exactly as Ansible does: content, a `line` or `block`, a package, service, user or group name, an `owner` or `group`.
- **Defaults that are true or false, lists, maps or Jinja.** Jinja prints `true` as `True`, and HCL prints it as `true`, so the two would disagree. These stay out of `variables.tf`, with a comment saying why.
- **`include_tasks`,** which Ansible reads only when the play gets there. If it names one file and has no `loop` or `when`, change it to `import_tasks` and convert again. An `import_tasks` with its own `when` or `vars` stays too, since those apply to every task it brings in.
- **`include_role`, `import_role` and dependencies in `meta/main.yml`.** `-role` writes one directory, so they have nowhere to go. Convert a playbook that runs the role with `-out` instead, such as `- hosts: all` with `roles: [app]`, and they come along, as [Roles a play runs](#roles-a-play-runs) describes.
- **`become` on a task.** In a circuit the `ssh` block decides that for every step: log in as root, or set `ssh_become`.
- **Templates with `{% %}`, `{# #}` or filters.** Rewrite those in `templatefile` syntax.
- **`argument_specs`.** Its checks don't carry over to variable types yet.

The exit codes are the same: 3 while anything is left.

Still deciding? [Conn3x vs Ansible](/compare/ansible) runs the same playbook both ways, and says where Ansible is the better choice.
