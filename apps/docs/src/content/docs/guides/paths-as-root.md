---
title: Paths as root
description: How a step running as root decides who it acts as on a path other users can change, what errors it can stop with, and what to do about each.
---

Root can write anywhere, so a path another user can change is a way to make root write somewhere it shouldn't. Before v0.6.12, a symlink planted in a home directory was enough ([GHSA-vjfh-6jw8-5rq9](https://github.com/conn3xorg/conn3x/security/advisories/GHSA-vjfh-6jw8-5rq9)).

v0.12.0 tightened the check again ([GHSA-mq96-3gxw-qrpg](https://github.com/conn3xorg/conn3x/security/advisories/GHSA-mq96-3gxw-qrpg)). This page describes it as it works from that release on.

Whenever `file`, `directory` or a step built on them, such as `line`, `block`, `ini`, `replace`, `link`, `archive`, `download` or `git`, works as root, it first checks who can change each directory on the way to the path. A step that connects as a normal user, without `become`, skips the check, because it has no extra rights to misuse.

## The three outcomes

| Who can change the path | What the step does | Example |
| --- | --- | --- |
| Nobody but root and the user you connected as | Runs as root | `/etc/app.conf` |
| Another user, who owns a directory or symlink on the way | Runs as that user, with only their permissions | `/home/alice/app.conf` runs as `alice` |
| One service account, through the group of a directory root owns | Runs as that account | `/var/lib/bind/db.example` runs as `bind` on Debian |
| Several users | Stops with an error, and changes nothing | `/srv/shared/app.conf`, with `/srv/shared` at mode `0777` |

The path is walked as you wrote it. A `..` goes back up from where the walk is, so a `..` after a symlink can't hide where the path really ends.

Under a sticky directory such as `/tmp`, a file directly inside is fine, unless another user's file is already at that path. A path that needs a missing directory there, such as `/tmp/app/config`, stops, because anyone could create `/tmp/app` first.

## When a step runs as another user

- A file with no `owner` belongs to that user, not root.
- `owner` set to anyone else is an error, because that user can't give files away.
- A `group` that user isn't in still works. The step runs with only the user's own groups, and root sets the group afterwards on the file itself, not on its name.
- `archive` unpacks as that user, who has to be able to read `src`. The entries belong to them. `git` uses their SSH keys.

To keep a file root's, put it outside that user's directories.

## Directories a group can write to

Packages often give a service its directory through a group: Debian ships `/var/lib/bind` as `root:bind`, mode `0775`. Anyone in that group can swap what's in the directory, so Conn3x looks at who has the group.

| Who has the directory's group | What the step does |
| --- | --- |
| Nobody but root, such as `root:staff` on Debian's `/usr/local` | Runs as root |
| Exactly one account, as a member or as its primary group | Runs as that account |
| Two or more accounts | Stops with an error |
| Any group with an ID of 1000 or above | Stops with an error |
| Anyone, through a write ACL on the directory | Stops with an error |

When the step runs as the service account:

- A file with no `owner` belongs to the service account. Before v0.12.0 it belonged to root.
- `owner` and `group` can name someone else, such as `owner = "root"`. Root sets them afterwards on the file itself.
- The account needs its own access to everything below. A directory in there that only root can enter, or a file only root can read, is out of the step's reach. Give it to the account, or move it elsewhere.

`/var/log` is the exception. Ubuntu ships it as `root:syslog`, and running as `syslog` would fail in every log directory of root's below it, so a step there runs as root. That leaves one limit: on such a host the `syslog` account itself could redirect root in `/var/log`. If that matters to you, keep managed paths out of it.

## confirm_after

[`confirm_after`](/modules/file) keeps a copy of the old file and schedules a revert, and both are root's work, done later and by name. So since v0.12.0 ([GHSA-8543-xr34-5mmx](https://github.com/conn3xorg/conn3x/security/advisories/GHSA-8543-xr34-5mmx)) the step refuses a file below a directory another account owns or runs in, and one directly in a directory anyone can create files in, such as `/tmp`.

The common case is a user's `authorized_keys`. Manage it with an [authorized_key](/modules/authorized_key) step, or with a `file` step that doesn't set `confirm_after`. Keep `confirm_after` for files on a path only root can change, such as `/etc/ssh/sshd_config`.

## Errors and what to do

| The error says | What to do |
| --- | --- |
| `<dir> belongs to alice, who can change anything in it, ... alice can't give a file to root` | Set `owner = "alice"`, or use a path outside `<dir>`. |
| `<dir> can be written by anyone` | Run `chmod o-w <dir>`, or use another path. |
| `<dir> can be written by its group, gid 1500, which more than one account has` | Run `chmod g-w <dir>`, or use another path. Leaving several accounts in that group means any of them could redirect root. |
| `<dir> has an ACL that lets others write to it` | Remove the ACL's write entries with `setfacl`, or use another path. |
| `it isn't the file or directory alice wrote any more` | Something replaced the file between the step writing it and root setting its owner or group. Apply again, and find out what else writes there. |
| `it belongs to uid 1234, in a directory anyone can create files in` | Another user's file is already at the path, in a directory such as `/tmp`. Set `owner` and `group` on the step, or remove the file first. |
| `anyone can create files in its directory` | `confirm_after` can't guard a file there. Move the file, or drop `confirm_after`. |
| `anyone can create <dir>, in /tmp` | Use a path outside the sticky directory. |
| `<dir> belongs to uid 1234, which has no name` | Give `<dir>` to a real user with `chown`. |
| `<dir> belongs to alice, and this has to run as root` | Move the path out of `alice`'s directories. A `mount` can't run as a user, and neither can the revert that `confirm_after` schedules. |
| `<path> exists but can't be read by alice` | Run `chown alice <path>`. If a new circuit release moved the file, run `conn3x apply -refresh=false` once. |
| `<path> can't be written by alice; give the file to alice first` | Run `chown alice <path>`, then apply again. |
| `<path> leads to <target>, which alice can't write` | Remove the link, or point `path` at somewhere `alice` can write. |

Any other failure while running as a user ends with `Conn3x ran this as alice, because <dir> belongs to alice`. Check what `alice` is allowed to do.

## The pip module

[`pip`](/modules/pip) goes further, because it runs code from the venv. The path and everything in the venv have to belong to root or the running user, and nobody else may be able to write to them, so a venv in a user's home needs `user` set to them.
