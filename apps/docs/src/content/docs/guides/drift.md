---
title: Find drift
description: See what changed by hand on your servers and in your cloud since the last apply.
---

Someone edits a config file on a server to fix an incident at 3am. Someone resizes a droplet in the console. Each time, what's running stops matching what's written, and nobody notices until the next apply quietly undoes it.

`conn3x drift` tells you first. It reads every resource and every host step again and reports what changed, without changing anything:

```text
$ conn3x drift
Drift found in 2 resources.

Cloud
  ~ digitalocean_droplet.web  changed

Hosts
  ~ conn3x_file.web__page["web1"]  changed

Run conn3x plan to see what Conn3x would change to put them back.
```

A file deleted outside Conn3x shows as `gone`.

## Run it on a schedule

`drift` exits 0 when nothing changed, 2 when something did, and 1 on errors, so a scheduled job can alert on it. For example, from GitHub Actions:

```yaml
- name: Check for drift
  run: conn3x drift -no-color
```

The job fails when drift appears, which is usually the alert you want.

## Then what

- To put things back, run `conn3x plan` to see the exact change, then `conn3x apply`.
- To keep the hand edit, change the circuit to match, then apply. The next `drift` comes back clean.
