---
title: How much of a role converts
description: "What conn3x convert ansible turns into steps today, measured on fifteen popular Galaxy roles, what it leaves for you and why, and which gaps are being closed."
---

`conn3x convert ansible` converts a task only when it can show the step does what Ansible does. Everything else stays in the output, commented out, with the reason. This page says how much that is on real roles, so you can decide whether converting saves you time before you try it.

The numbers are for Conn3x v0.22.0. v0.21.0 converted 38 tasks of the same roles.

## Fifteen Galaxy roles

We run the converter on fifteen popular roles from Ansible Galaxy, all by geerlingguy, with `conn3x convert ansible -role`. Every circuit it writes passes `conn3x validate`.

| Role | Converted | Left for you |
| --- | --- | --- |
| apache | 6 | 21 |
| certbot | 6 | 12 |
| docker | 3 | 30 |
| firewall | 1 | 11 |
| git | 1 | 12 |
| java | 3 | 9 |
| mysql | 2 | 48 |
| nginx | 5 | 13 |
| nodejs | 2 | 13 |
| ntp | 7 | 7 |
| php | 7 | 48 |
| pip | 1 | 2 |
| postgresql | 5 | 31 |
| redis | 3 | 8 |
| security | 5 | 16 |
| **Total** | **57** | **281** |

"Left for you" counts every task and handler that stayed for review, plus role-level items such as `meta/main.yml` dependencies. So on roles this size, expect the converter to write about one task in six and to explain the rest. The explanation is the useful part: each `TODO(convert)` says what stopped it, which is usually the thing you'd have to think about anyway.

## What stops a task

These are the reasons the fifteen roles hit most, in order:

| Reason | Tasks |
| --- | --- |
| A `when` the converter can't translate | 91 |
| A variable that isn't a role default or a per-OS value | 17 |
| `no_log` | 16 |
| `register` | 14 |
| A `with_items` loop it can't translate | 13 |
| A probe that runs after tasks that change the host | 10 |
| `include_vars` the converter can't read | 10 |
| `set_fact` | 9 |

A `when` on the host's OS family, distribution or major version converts, as does one on a true-or-false role default, a role default compared to text, a list's length, whether a package is installed, or a read-only probe's result, and any of those combined with `and`, `or` and `not`. The 91 left test things like a registered result from a task that changes the host (`.rc`, `.stat.exists`, `is changed`), `is defined`, or a filter such as `default`.

## Being worked on

Each of these has an open issue:

- `ansible_check_mode`, which is false on every real run ([#917](https://github.com/conn3xorg/conn3x/issues/917), a good first issue).
- Loops over a role's list of maps beyond plain fields ([#879](https://github.com/conn3xorg/conn3x/issues/879)).

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
