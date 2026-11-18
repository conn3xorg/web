---
title: Undo a change
description: Put a server back the way it was after an apply you regret, by reverting the configuration, by keeping copies of the files a step replaces, or by letting the host revert a change that locks you out.
---

An apply changed something it shouldn't have. A config file that nginx now refuses, a sysctl the database hates, an sshd setting that keeps you out. How you get back depends on whether you can still run Conn3x against that host.

## Revert the configuration, then apply

The configuration is what Conn3x makes the host match, so the undo that lasts is the one in the configuration. Revert the commit and plan:

```sh
git revert HEAD
conn3x plan
```

The plan shows exactly what it puts back, step by step and host by host, before anything changes. Apply it, and the next run, yours or a teammate's, keeps it that way.

Undoing by hand on the host doesn't last. If the configuration still asks for the new content, `conn3x drift` reports the hand fix as drift, and the next apply writes the new content again.

Two cases need more than a revert:

- **A step the commit added.** Reverting removes the step, and by default a removed step leaves its object on the host (`on_remove = "forget"`). To take it away as well, set `on_remove = "delete"` on the step and apply before you revert. [Removal](/reference/circuits/removal) lists what `delete` does for each module.
- **A file whose old content isn't in any commit.** If the file was edited by hand before Conn3x managed it, the revert has nothing to restore it from. That's what `backup` is for.

## Keep a copy of each file a step replaces

Set `backup = true` on a `file`, `template`, `line`, `block`, `ini` or `replace` step, and before each change the step copies the file beside itself, keeping its mode and owner:

```hcl
step "nginx_conf" {
  template {
    source      = "nginx.conf.tftpl"
    destination = "/etc/nginx/nginx.conf"
    backup      = true
    backup_keep = 5
  }
}
```

The copy is named after the file, the time in UTC and a number, and ends in `~`, which `cron.d`, `logrotate.d` and the like skip, so the copy is never loaded as a second config:

```text
/etc/nginx/nginx.conf.conn3x-20261118T220844Z.58377~
```

An apply that changes nothing makes no copy. `backup_keep` keeps only the newest few; without it, copies stay until you remove them. Since v0.27.0, the step's `backup_file` attribute holds the path of the newest copy, so a handler or an output can name it.

To put a copy back by hand:

```sh
cp -p /etc/nginx/nginx.conf.conn3x-20261118T220844Z.58377~ /etc/nginx/nginx.conf
systemctl reload nginx
```

Then revert the configuration too, or the next apply writes the new content again.

`backup` can't go with `content_wo` or a template's `write_only`: each copy would keep the secret the change replaced.

## Let the host revert a change that locks you out

When the change is the thing that stops Conn3x reaching the host, such as `sshd_config` or a firewall rule file, there's no apply left to undo it with. Set `confirm_after` on the `file` or `template` step:

```hcl
step "sshd" {
  file {
    path          = "/etc/ssh/sshd_config"
    content       = file("sshd_config")
    validate      = "sshd -t -f %s"
    confirm_after = "60s"
    reload        = "systemctl reload sshd"
  }
}
```

Before writing, the host keeps a copy of the old file and schedules its own revert. Conn3x writes the file, runs `reload` and logs in again over a new connection. If that login works, it cancels the revert. If it doesn't come within 60 seconds, the host puts the old file back and runs `reload` by itself, even if Conn3x has gone away. The [file module](/modules/file) has the details. It needs systemd on the host.

`validate` catches a file the service would refuse before it replaces anything, which is cheaper than any undo.

## Which to use

| Situation | Use |
| --- | --- |
| The change was in the configuration, and you can reach the host | Revert the commit and apply |
| The file's old content was never in a commit | `backup = true`, then copy it back and revert |
| The change can stop Conn3x logging in | `confirm_after`, with `reload` |
| The service would refuse the new file | `validate`, so it's never written |

There's no `conn3x rollback` command yet. [conn3x#1011](https://github.com/conn3xorg/conn3x/issues/1011) weighs one; say there if you need it.
