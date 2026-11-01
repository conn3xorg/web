---
title: Paths as root
description: How a step running as root decides who it acts as on a path other users can change, what errors it can stop with, and what to do about each.
---

Root can write anywhere, so a path another user can change is a way to make root write somewhere it shouldn't. Before v0.6.12, a symlink planted in a home directory was enough ([GHSA-vjfh-6jw8-5rq9](https://github.com/conn3xorg/conn3x/security/advisories/GHSA-vjfh-6jw8-5rq9)).

Now, whenever `file`, `directory` or a step built on them, such as `line`, `block`, `ini`, `replace`, `link`, `archive`, `download` or `git`, works as root, it first checks who can change each directory on the way to the path. A step that connects as a normal user, without `become`, skips the check, because it has no extra rights to misuse.

## The three outcomes

| Who can change the path | What the step does | Example |
| --- | --- | --- |
| Nobody but root and the user you connected as | Runs as root | `/etc/app.conf` |
| Another user, who owns a directory or symlink on the way | Runs as that user, with only their permissions | `/home/alice/app.conf` runs as `alice` |
| Several users | Stops with an error, and changes nothing | `/srv/shared/app.conf`, with `/srv/shared` at mode `0777` |

Under a sticky directory such as `/tmp`, a file directly inside is fine. A path that needs a missing directory there, such as `/tmp/app/config`, stops, because anyone could create `/tmp/app` first.

## When a step runs as another user

- A file with no `owner` belongs to that user, not root.
- `owner` set to anyone else is an error, because that user can't give files away.
- `archive` entries belong to that user, and `git` uses their SSH keys.

To keep a file root's, put it outside that user's directories.

## Errors and what to do

| The error says | What to do |
| --- | --- |
| `<dir> belongs to alice, who can change anything in it, ... alice can't give a file to root` | Set `owner = "alice"`, or use a path outside `<dir>`. |
| `<dir> can be written by anyone` | Run `chmod o-w <dir>`, or use another path. |
| `<dir> can be written by its group, gid 1500` | Run `chmod g-w <dir>`, or use another path. Leaving people in that group means any of them could redirect root. |
| `anyone can create <dir>, in /tmp` | Use a path outside the sticky directory. |
| `<dir> belongs to uid 1234, which has no name` | Give `<dir>` to a real user with `chown`. |
| `<dir> belongs to alice, and this has to run as root` | Move the path out of `alice`'s directories. A `mount` can't run as a user. |
| `<path> exists but can't be read by alice` | Run `chown alice <path>`. If a new circuit release moved the file, run `conn3x apply -refresh=false` once. |
| `<path> can't be written by alice; give the file to alice first` | Run `chown alice <path>`, then apply again. |
| `<path> leads to <target>, which alice can't write` | Remove the link, or point `path` at somewhere `alice` can write. |

Any other failure while running as a user ends with `Conn3x ran this as alice, because <dir> belongs to alice`. Check what `alice` is allowed to do.

## The remaining limit

A root-owned directory writable by a system group with no people in it is still trusted, such as `root:syslog` on `/var/log` on Ubuntu. Conn3x counts a group as empty of people when its ID is below 1000 and no account with a UID of 1000 or above belongs to it. A compromised member of that group, such as a service, could still redirect root there. If that matters on your hosts, keep managed paths out of those directories.

## The pip module

[`pip`](/modules/pip) goes further, because it runs code from the venv. The path and everything in the venv have to belong to root or the running user, and nobody else may be able to write to them, so a venv in a user's home needs `user` set to them.
