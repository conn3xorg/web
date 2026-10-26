---
title: "Coming from Ansible"
description: "Your playbooks already describe how your servers should look. Here's how they carry over to Conn3x, what the converter does for you, and what's left."
date: 2026-10-25
author: James Conway
image: /media/blog/coming-from-ansible/card.png
imageAlt: "An Ansible task with a loop on the left and the Conn3x step it converts to on the right."
---

If you write Ansible, you already think the way Conn3x does. Hosts, tasks that run in order, handlers that fire when something changed. None of that goes away. What changes is where it lives and what you get back before anything runs.

This is the first of three short posts, one for each of the readers from [Why Conn3x is one tool](/blog/why-conn3x). This one is for you if your playbooks came first.

## What carries over

A play becomes a circuit. Its hosts become a map of names to addresses, its tasks become steps, and its handlers stay handlers:

| Ansible | Conn3x |
| --- | --- |
| play, `hosts:` and inventory | `circuit`, `hosts = { ... }` |
| task | `step`, in the same order |
| `notify:` and handlers | `notify = [handler.NAME]` and `handler` |
| `become: true` | `become = true` in the `ssh` block |
| `loop: [a, b]` with `{{ item }}` | `for_each = ["a", "b"]` with `item.value` |
| `--check --diff` | `conn3x plan`, every time |
| Jinja templates | `templatefile` syntax in a `template` step |

The last row is the one that takes real work, and we'll come back to it.

## Let the converter start

You don't have to rewrite anything by hand to see what your playbook looks like as a circuit. Point the converter at it, with your inventory:

```sh
conn3x convert ansible -i inventory.ini -out site.tf site.yml
```

Here's a small playbook for two app servers: a few packages in a loop, a service, a user, a sysctl, a config file with a handler, and an environment file rendered from a Jinja template. The converter's answer:

```text
Converted 5 tasks. 1 thing needs you; each is marked TODO(convert):
  line 34, Write the environment file: renders a Jinja template; rewrite it in templatefile syntax (${var}, %{ if }) and use a template step
```

<figure class="clip" data-clip>
  <video src="/media/blog/coming-from-ansible/convert.mp4" poster="/media/blog/coming-from-ansible/convert.webp" width="1280" height="720" controls muted loop playsinline preload="metadata" aria-label="A terminal running conn3x convert ansible on a playbook: five tasks convert, one Jinja template is marked TODO, and conn3x validate accepts the result."></video>
  <figcaption>The converter on a real playbook, then <code>conn3x validate</code> on what it wrote.</figcaption>
  <button type="button" data-clip-toggle hidden>Pause</button>
</figure>

The loop came through as a step that repeats:

```hcl
step "install_the_basics" {
  for_each = ["chrony", "git", "jq"]
  package {
    name = item.value
  }
}
```

The config file kept its handler, and the inventory became the circuit's hosts, with `ansible_user` as the login:

```hcl
circuit "app_servers" {
  hosts = {
    app1 = "203.0.113.21"
    app2 = "203.0.113.22"
  }

  ssh {
    user             = "deploy"
    private_key_file = var.ssh_private_key_file
    become           = true
  }
  # ...
}
```

## What it leaves for you

The converter only translates what it can show means the same thing. Everything else stays in the output as the original YAML, commented, under a `TODO(convert)` line that says why. It never guesses and never drops an argument. If it doesn't understand one, it leaves the whole task, because a step that quietly does less than your task did is worse than a TODO.

Expect to finish these by hand:

- **Jinja templates.** Rewrite `{{ var }}` as `${var}` and `{% if %}` as `%{ if }`, and use a `template` step. It renders on your machine, so the plan shows the finished file's diff.
- **`when` and `register`.** In a circuit, a decision happens at plan time, usually by choosing which hosts a circuit covers.
- **Loops over variables or over items with fields.** Write `for_each` with a map yourself.
- **Commands that ran on every play.** A step runs when something is out of date, so a `command` needs a `creates`, `removes` or `unless` guard to know when it's done.

The command exits 3 while anything is left, so you can run it in CI until the count reaches zero.

<figure>
  <a href="/media/blog/coming-from-ansible/cheatsheet.png">
    <img src="/media/blog/coming-from-ansible/cheatsheet.png" width="1600" height="3011" loading="lazy" decoding="async" alt="Cheat sheet: Ansible concepts on the left and their Conn3x equivalents on the right, with what the converter translates and what it leaves for you." />
  </a>
  <figcaption>The cheat sheet, to keep next to your playbooks.</figcaption>
</figure>

<details>
<summary>Read the cheat sheet as text</summary>

- **Converts:** a play, its hosts and inventory become a `circuit` with `hosts` and an `ssh` block.
- **Converts:** tasks become steps, in the same order.
- **Converts:** `notify` and handlers become `notify = [handler.NAME]` and `handler` blocks.
- **Converts:** `become: true` becomes `become = true` in the `ssh` block.
- **Converts:** a `loop` over a plain list with `{{ item }}` becomes `for_each` with `item.value`.
- **Built in:** `--check --diff` becomes `conn3x plan`, which reads the hosts every time.
- **By hand:** Jinja templates become `templatefile` syntax, `${var}` and `%{ if }`, in a `template` step.
- **By hand:** `when` and `register` become decisions at plan time, often which hosts a circuit covers.
- **By hand:** loops over variables or dicts become `for_each` with a map.
- **By hand:** a `command` that ran on every play needs a `creates`, `removes` or `unless` guard.
- `conn3x convert ansible` exits 3 while anything is left, so CI can count it down to zero.

</details>

## What you get that you didn't have

**A plan you can read before anything runs.** Every `conn3x plan` reads the servers first, so it shows a real diff: the package that's missing, the line in the file that's different. In Ansible, that's a separate `--check --diff` run you have to remember.

**A second run that proves the first.** Apply, then plan again. It should say `No changes.` If it doesn't, something isn't idempotent, and you find out now rather than on the next deploy.

**Drift you hear about.** `conn3x drift` reads every host and exits 2 when something was changed by hand, so a scheduled job can tell you.

**Nothing to install on the servers.** No Python on the hosts, no agent. Conn3x logs in over SSH, checks the host key and runs ordinary shell commands.

## Try it on your own playbook

```sh
brew install conn3xorg/tap/conn3x
conn3x convert ansible -i inventory.ini -out site.tf site.yml
```

The [migration guide](https://docs.conn3x.org/guides/migrate-from-ansible) lists every module the converter knows. If yours uses one it doesn't, [open an issue](https://github.com/conn3xorg/conn3x/issues) with the task, or pick up [one that's waiting](https://github.com/conn3xorg/conn3x/issues/84). Converter mappings make good first contributions.
