---
title: How much of a role converts
description: "What conn3x convert ansible turns into steps today, measured on fifteen popular Galaxy roles, what it leaves for you and why, and which gaps are being closed."
---

`conn3x convert ansible` converts a task only when it can show the step does what Ansible does. Everything else stays in the output, commented out, with the reason. This page says how much that is on real roles, so you can decide whether converting saves you time before you try it.

The numbers are for Conn3x v0.36.0, measured on 26 November 2026. Across the fifteen roles below it converts 106 tasks and leaves 231 for you. v0.25.0 converted 89 and left 247 on the same role releases; v0.24.0 converted 86, v0.23.0 61, v0.22.0 57, and v0.21.0 38.

## Fifteen Galaxy roles

We run the converter on fifteen popular roles from Ansible Galaxy, all by geerlingguy, with `conn3x convert ansible -role geerlingguy.<name>`. That downloads each role's latest release, the version in the table. Every circuit it writes passes `conn3x init -backend=false` and `conn3x validate`.

| Role | Version | Converted | Left for you |
| --- | --- | --- | --- |
| apache | 4.2.1 | 9 | 18 |
| certbot | 5.5.0 | 7 | 11 |
| docker | 8.0.1 | 5 | 27 |
| firewall | 2.7.0 | 4 | 8 |
| git | 3.0.1 | 3 | 10 |
| java | 2.6.1 | 3 | 9 |
| mysql | 6.5.0 | 11 | 39 |
| nginx | 3.3.1 | 7 | 13 |
| nodejs | 7.1.0 | 4 | 11 |
| ntp | 4.0.1 | 9 | 5 |
| php | 6.2.1 | 16 | 39 |
| pip | 3.1.2 | 1 | 2 |
| postgresql | 4.3.0 | 14 | 22 |
| redis | 2.0.0 | 5 | 5 |
| security | 3.1.0 | 8 | 12 |
| **Total** | | **106** | **231** |

"Left for you" counts every task and handler that stayed for review, plus role-level items such as `meta/main.yml` dependencies. So on roles this size, expect the converter to write about one task in three and to explain the rest. The explanation is the useful part: each `TODO(convert)` says what stopped it, which is usually the thing you'd have to think about anyway.

Ten roles convert more than they did at v0.25.0. nodejs converts one fewer: its Red Hat task that installs the NodeSource release package straight from a URL now stays for review, because there's nothing to check the file against. Download it with a `download` step and a `sha256`, then install it with a `package` step's `source`.

### Twenty-one more

v0.36.0's work came from converting 36 of geerlingguy's roles, so here are the other twenty-one, measured the same way. None of them were on this page before. All 21 circuits pass `conn3x validate`.

| Role | Version | Converted | Left for you |
| --- | --- | --- | --- |
| composer | 1.9.2 | 1 | 12 |
| elasticsearch | 5.2.0 | 4 | 7 |
| gitlab | 3.2.0 | 6 | 8 |
| go | 1.1.0 | 2 | 3 |
| haproxy | 1.3.2 | 3 | 3 |
| jenkins | 5.3.1 | 7 | 35 |
| kubernetes | 8.3.0 | 6 | 28 |
| memcached | 2.2.0 | 5 | 1 |
| munin | 2.2.1 | 2 | 6 |
| nfs | 2.1.1 | 6 | 3 |
| php-versions | 7.2.0 | 2 | 15 |
| postfix | 2.1.0 | 2 | 1 |
| rabbitmq | 3.0.0 | 6 | 6 |
| repo-epel | 3.1.1 | 0 | 4 |
| repo-remi | 2.1.0 | 0 | 2 |
| ruby | 3.2.1 | 9 | 9 |
| samba | 1.3.0 | 4 | 1 |
| solr | 7.0.0 | 3 | 13 |
| supervisor | 3.3.0 | 4 | 7 |
| swap | 2.2.0 | 0 | 11 |
| varnish | 3.3.2 | 7 | 14 |
| **Total** | | **79** | **189** |

All 36 together: 185 converted, 420 left for you.

## What stops a task

These are the reasons the fifteen roles hit most, in order:

| Reason | Tasks |
| --- | --- |
| A `when` the converter can't translate | 64 |
| `no_log` | 16 |
| A probe that runs after tasks that change the host | 15 |
| A variable that isn't a role default or a per-OS value | 12 |
| A Jinja expression the converter can't translate | 12 |
| A role default whose value Conn3x would use differently from Ansible for some settings | 12 |
| A task or include only for OS families the converter doesn't write steps for, such as Arch Linux, SUSE or FreeBSD | 11 |
| `set_fact` | 9 |
| `register` | 9 |
| A per-OS value that isn't plain text, such as a list, or text YAML could read as a number | 9 |
| `include_vars` the converter can't read | 7 |

A `when` on the host's OS family, distribution, major version, release codename or service manager converts, as does one on a true-or-false role default, a role default compared to text, a list's length, whether a package is installed, `ansible_version`, or a read-only probe's result, and any of those combined with `and`, `or` and `not`. The 64 left test things like a registered result from a task that changes the host, `is defined`, `is match`, or a filter such as `default`.

The OS-family row is mostly roles' setup files for Arch Linux, SUSE, FreeBSD and OpenBSD. The converter writes steps for Debian and Red Hat family hosts, so on the hosts it targets those tasks would never run. They stay in the output, commented out, so you can see what was left behind.

## What changed in v0.36.0

v0.36.0 came out of converting 36 of geerlingguy's roles and working down what each one left. Between v0.25.0 and v0.36.0 the fifteen roles above went from 89 tasks converted to 106.

- A role default used as a `service`'s `state` or `enabled`, or a package's `state`, becomes a variable, validated against the values the step takes ([#1436](https://github.com/conn3xorg/conn3x/issues/1436)).
- `enablerepo: "{{ x | default(omit, true) }}"` becomes `enable_repositories`, unset when the default is empty. A `package` task with `enablerepo` converts only on Red Hat family hosts ([#1437](https://github.com/conn3xorg/conn3x/issues/1437)).
- A role default built from other defaults with plain `{{ name }}`, such as `docker_packages: ["docker-{{ docker_edition }}"]`, becomes a variable, with a local that builds the value the way the role does. Filters, lookups, facts and conditions in a default still stay for review ([#1465](https://github.com/conn3xorg/conn3x/issues/1465)).
- A host fact inside an argument, such as `suites: "{{ ansible_facts.distribution_release }}"`, becomes the per-host lookup. `distribution` and `distribution_version`, whose values differ between Ansible and Conn3x, stay for review, and this works in roles, not yet in a play's own tasks ([#1450](https://github.com/conn3xorg/conn3x/issues/1450)).
- `conn3x_host` reads the release codename and the service manager, so a `when` on either converts.
- `include_tasks` behind a `when` the converter reads, or behind a read-only probe registered before it, is followed, and its condition is added to each task inside. An include whose own tasks set a name the condition reads stays for review ([#1440](https://github.com/conn3xorg/conn3x/issues/1440), [#1453](https://github.com/conn3xorg/conn3x/issues/1453)).
- A role default that's also set in vars files for OS families Conn3x doesn't configure, such as `Suse.yml` or `Archlinux.yml`, stays a variable, with a note naming the files it ignored. The converter also follows `include_vars` with a `first_found` lookup over `vars/` ([#1441](https://github.com/conn3xorg/conn3x/issues/1441)).
- A `when` that tests `ansible_version` is read as ansible-core 2.16 or later, and the circuit's README says so ([#1442](https://github.com/conn3xorg/conn3x/issues/1442)).
- Free-form arguments split the way Ansible splits them, so `service: name={{ redis_daemon }} state=restarted` converts ([#1433](https://github.com/conn3xorg/conn3x/issues/1433)).
- A repository key from the role's `files/` is copied into the output, so the circuit plans; before, the `file()` it pointed to was missing ([#1469](https://github.com/conn3xorg/conn3x/issues/1469)).
- A `path`, `dest` or similar under `~` stays for review, since `~` depends on who the task runs as; before, it converted and then failed `conn3x validate` ([#1445](https://github.com/conn3xorg/conn3x/issues/1445)).

## What changed from v0.26.0 to v0.35.0

These releases mostly taught the converter more modules:

- v0.35.0: a `stat` probe read only as `.stat.exists` becomes a read-only check; `cron` with `cron_file`, `script` running sh or bash, `win_environment`, and `enablerepo` and `default_release` on packages convert; a `raw` task that only installs Python converts to no step. An unquoted `yes`, `1.10` or `0755` in free-form text now stays for review, with what Ansible would pass instead.
- v0.34.0: `copy` with `remote_src: true`, and more `docker_container` and `podman_container` options.
- v0.33.0: `git` with `recursive` maps to `submodules`.
- v0.32.0: a ufw or firewalld port given as a service name, such as `ssh/tcp`, stays for review instead of converting to a step plan refuses.
- v0.31.0: `iptables` and `pamd`.
- v0.29.0: `patch`, `archive` and `docker_compose_v2`.
- v0.28.0: `deb822_repository`, an `apt_key` or `rpm_key` folded into the repository it signs, `git` with `force`, `parted`, `xml`, PostgreSQL schemas and extensions, network config and resource modules, and more `user` and `mount` options.
- v0.27.0: `seport`, `openssh_keypair`, `win_share`, `lineinfile` with `backrefs`, `blockinfile` markers, and `systemd` with `masked`.
- v0.26.0: `backup: yes` on `copy`, `template` and the edit modules carries over.

## What changed in v0.25.0

- A `register` that nothing in the role reads no longer keeps its task for review, and a task that only refreshes the package lists converts whatever its `when` says, since Conn3x refreshes them itself. That took 86 to 89, all in nodejs ([#882](https://github.com/conn3xorg/conn3x/issues/882)).

## What changed in v0.24.0

- A per-OS default that only some releases' vars files set converts. The steps that read it get a precondition, so a host whose release has no such file stops at plan, naming itself, as Ansible stops on the undefined value. Defaults from an included file, such as geerlingguy.mysql's `variables.yml`, count too. That took the fifteen roles from 61 to 79 ([#973](https://github.com/conn3xorg/conn3x/issues/973)).
- A package task whose `name` is a list, from a role default or per OS from `vars/`, becomes a step per item. That took 79 to 86, mostly in php, postgresql and mysql.
- Text from a role, such as a vars file's name, is written into the circuit as an HCL string, so a `${` in it stays text ([GHSA-vw46-5wwm-wc8g](https://github.com/conn3xorg/conn3x/security/advisories/GHSA-vw46-5wwm-wc8g)).

## What changed in v0.23.0

- `ansible_check_mode` reads as false, as it is on every real run, which brought over three tasks ([#917](https://github.com/conn3xorg/conn3x/issues/917)).
- Loops over a list of maps convert, from a role default or written in the task, with role defaults inside the items ([#879](https://github.com/conn3xorg/conn3x/issues/879)). Combined with `validate` and `mode` on `lineinfile` and a dropped daemon-reload handler, that brought over geerlingguy.security's sshd hardening task.

This page gets new numbers with each release.

## Left for you on purpose

Some tasks stay for review because the converted step would behave differently, not because nobody has got to them:

- **`become` on a task.** In a circuit the `ssh` block decides who runs every step. Take it off the task, and log in as root or set `ssh_become`.
- **`no_log`.** Converting the task would write its values into the circuit, where anyone reading the file sees them. Since v0.38.0, a role's `no_log` task does convert when every value it passes comes straight from one of the role's defaults and goes into a write-only argument, such as `content_wo` on a `file` step or `password_wo` on `postgresql_role`. A literal secret, a Jinja expression, a loop or a `when` that reads the secret still keeps the task here, and the reason names what stopped it. None of the 18 `no_log` tasks in the 36 roles converts yet: most loop over users or template a name or path.
- **`force: no` on `copy` or `template`.** Ansible writes the file only when it's missing. A Conn3x step makes the file match on every apply.
- **A task tagged `never`.** Ansible runs it only when you ask for its tag. A step runs on every apply.
- **Templates with Jinja statements**, `{% %}` or `{# #}`. Rewrite them in `templatefile` syntax (`${var}`, `%{ if }`).

## Try it on your own role

```sh
conn3x convert ansible -role ./roles/myrole -out ./circuits/myrole
```

The summary lists every task that needs you and why. If the reason you hit most isn't on this page, say so on [GitHub Discussions](https://github.com/conn3xorg/conn3x/discussions). It's how we pick what to convert next. The [migration guide](/guides/migrate-from-ansible) covers the modules that convert and how to finish what's left.
