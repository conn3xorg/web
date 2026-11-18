---
title: How much of a role converts
description: "What conn3x convert ansible turns into steps today, measured on fifteen popular Galaxy roles, what it leaves for you and why, and which gaps are being closed."
---

`conn3x convert ansible` converts a task only when it can show the step does what Ansible does. Everything else stays in the output, commented out, with the reason. This page says how much that is on real roles, so you can decide whether converting saves you time before you try it.

The numbers are for Conn3x v0.25.0. v0.24.0 converted 86 tasks of the same roles, v0.23.0 61, v0.22.0 57, and v0.21.0 38.

## Fifteen Galaxy roles

We run the converter on fifteen popular roles from Ansible Galaxy, all by geerlingguy, with `conn3x convert ansible -role`. Every circuit it writes passes `conn3x validate`.

| Role | Converted | Left for you |
| --- | --- | --- |
| apache | 7 | 20 |
| certbot | 7 | 11 |
| docker | 3 | 29 |
| firewall | 1 | 11 |
| git | 2 | 11 |
| java | 3 | 9 |
| mysql | 10 | 40 |
| nginx | 5 | 13 |
| nodejs | 5 | 10 |
| ntp | 9 | 5 |
| php | 15 | 40 |
| pip | 1 | 2 |
| postgresql | 12 | 24 |
| redis | 3 | 8 |
| security | 6 | 14 |
| **Total** | **89** | **247** |

"Left for you" counts every task and handler that stayed for review, plus role-level items such as `meta/main.yml` dependencies. So on roles this size, expect the converter to write about one task in four and to explain the rest. The explanation is the useful part: each `TODO(convert)` says what stopped it, which is usually the thing you'd have to think about anyway.

## What stops a task

These are the reasons the fifteen roles hit most, in order:

| Reason | Tasks |
| --- | --- |
| A `when` the converter can't translate | 73 |
| `no_log` | 16 |
| `register` | 13 |
| A variable that isn't a role default or a per-OS value | 10 |
| A probe that runs after tasks that change the host | 10 |
| `include_vars` the converter can't read | 10 |
| `set_fact` | 9 |
| A `with_items` loop it can't translate | 4 |

A `when` on the host's OS family, distribution or major version converts, as does one on a true-or-false role default, a role default compared to text, a list's length, whether a package is installed, or a read-only probe's result, and any of those combined with `and`, `or` and `not`. The 73 left test things like a registered result from a task that changes the host (`.rc`, `.stat.exists`, `is changed`), `is defined`, or a filter such as `default`.

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
- **`no_log`.** Converting the task would write its values into the circuit, where anyone reading the file sees them. Move the secret into a write-only argument.
- **`force: no` on `copy` or `template`.** Ansible writes the file only when it's missing. A Conn3x step makes the file match on every apply.
- **A task tagged `never`.** Ansible runs it only when you ask for its tag. A step runs on every apply.
- **Templates with Jinja statements**, `{% %}` or `{# #}`. Rewrite them in `templatefile` syntax (`${var}`, `%{ if }`).

## Try it on your own role

```sh
conn3x convert ansible -role ./roles/myrole -out ./circuits/myrole
```

The summary lists every task that needs you and why. If the reason you hit most isn't on this page, say so on [GitHub Discussions](https://github.com/conn3xorg/conn3x/discussions). It's how we pick what to convert next. The [migration guide](/guides/migrate-from-ansible) covers the modules that convert and how to finish what's left.
