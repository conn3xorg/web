---
title: Connection pooling and host keys
description: How Conn3x shares one SSH connection per host and login, caps the sessions on it, checks it with keepalives, verifies host keys, and connects through jump hosts.
---

A circuit with 20 steps on 50 hosts makes 1,000 step instances, and each one runs several commands on its host. Conn3x doesn't open an SSH connection for each. It keeps one connection per host and login for the whole command, and runs every command in a session on it. This page describes that connection: when it's shared, how many sessions it carries, how Conn3x notices it has died, and how it checks the host's identity.

## One connection per host and login

The first step instance that needs a host dials it. Every later instance that reaches the same host the same way gets that connection from a pool, and the connection stays open until the `conn3x` command exits. A plan's refresh and the apply that follows it in one `conn3x apply` share it, and so do steps in different circuits that reach the same host the same way.

Two instances share a connection only when all of these are the same:

- the address and port they connect to;
- the login user;
- the private key, or the SSH agent when there is none;
- `host_key` and `known_hosts_file`;
- `become`, and the sudo password read from `become_password_file`;
- the jump hosts, in order.

Anything else gets a connection of its own. The same server reached through a different bastion is a different connection, and so is the same server with `become` turned off.

The address and port here are the ones Conn3x actually connects to, after looking the host up in `ssh_config_file` if you set one. Conn3x reads that file, and the key file, each time an instance asks for a connection.

While one instance is dialing a host, the others that need the same connection wait for that dial instead of starting their own. If the dial fails, the next instance to ask dials again.

### A dead connection

Before it hands out a pooled connection, Conn3x sends it an OpenSSH keepalive request. If the request fails, Conn3x closes the connection and dials a new one.

## Sessions on the connection

Each command runs in its own SSH session on the shared connection. OpenSSH's sshd allows 10 sessions per connection by default (`MaxSessions` in `sshd_config`) and refuses the eleventh, so Conn3x caps the sessions it opens at once on one connection. The cap is 8, which leaves room for a session that's still closing when the next one opens. A command that finds every session in use waits for one to free up; it doesn't fail.

To change the cap, set `CONN3X_SSH_MAX_SESSIONS` to a number from 1 to 1000. Any other value is ignored with a warning in the log, and the cap stays at 8. You only need to raise it for a server that allows more than 10 sessions.

### A server that allows fewer

If the server refuses a session with `open failed`, which is what sshd says at `MaxSessions`, Conn3x lowers the cap for that connection to the number of sessions it has open, waits for one of them to close, and tries again. The command hadn't started, so trying again can't run it twice. It stops lowering at one session; a refusal then fails the command. The new cap holds for the life of that connection, and Conn3x logs it at `INFO` level the first time a session opens under it.

### When a session counts as closed

sshd counts a session against `MaxSessions` until it has processed the close. A new session opened the moment the old one closes can be refused. So after a session closes, Conn3x sends a keepalive request and frees the session's slot only once the server replies, which shows the server has handled the close. One keepalive frees every session closed before it was sent.

If the server doesn't answer that keepalive within 30 seconds, Conn3x takes it for gone and closes the connection. Commands waiting for a session then fail instead of hanging, and the next instance that needs the host dials it again.

Conn3x sends keepalives only in these two cases, when it hands out a pooled connection and after sessions close. It doesn't send them on a timer while the connection is idle.

## Dialing and retries

A dial connects, checks the host key, and logs in. When the host doesn't answer, Conn3x keeps trying until the `ssh` block's `timeout` (3 minutes by default) has passed, waiting 1, 2 and 4 seconds between the first attempts and 8 seconds after that. Each attempt has 15 seconds to finish, across all its jump hosts.

These failures end the dial at once, without waiting out the `timeout`:

- a host key that isn't recorded, or doesn't match;
- a login that the server rejects;
- a host name that DNS says doesn't exist.

A refresh waits at most 10 seconds instead of the whole `timeout`. See [How plan reads hosts](/internals/plan-reads#when-a-host-doesnt-answer).

## Host keys

Conn3x verifies the host key on every connection, for the target and for each jump host. There is no setting to skip it.

### Against known_hosts

Without `host_key`, Conn3x checks the key against `known_hosts_file`, or `~/.ssh/known_hosts`. The host is looked up as `host` on port 22, and as `[host]:port` on any other port, the way OpenSSH records it.

Before it connects, Conn3x looks up which key types the file records for the host, and asks the server for a key of one of those types. A server with both an Ed25519 and an RSA key, recorded in the file only by its Ed25519 key, is asked for the Ed25519 key, so the check doesn't fail on a key the file has no record of.

The check fails when:

- the file has no entry for the host. The error tells you to verify the key and add it, for example with `ssh-keyscan`;
- the file has an entry, but the server's key doesn't match it. The error says the key changed since it was recorded;
- the file can't be read.

Conn3x never adds to or changes the known_hosts file.

### Against host_key

With `host_key`, Conn3x accepts only that key and doesn't read the known_hosts file for the target. It asks the server for a key of that type, and fails if the key the server presents isn't byte-for-byte the pinned one. `host_key` applies only to the target; jump hosts are still checked against the known_hosts file.

## Jump hosts

With `jump_hosts`, or `ProxyJump` from `ssh_config_file`, Conn3x connects through each hop in order, as `ssh -J` does:

1. It connects to the first hop, checks its host key against the known_hosts file, and logs in.
2. Through that connection, it opens a TCP connection to the next hop, or to the target after the last hop, and runs SSH over it.
3. It repeats until it reaches the target.

Each hop logs in with its own user, or the target's when the hop doesn't name one, and with the target's key, unless a `ProxyJump` hop's entry in the SSH config file sets its own `IdentityFile`.

The hop connections belong to the target's connection. Two targets behind the same bastion each open their own connection to it, and closing a target's connection closes its hops. A pooled connection is shared only by instances that use the same hops in the same order.

For the settings themselves, see [Jump hosts](/reference/circuits/ssh#jump-hosts) and [Reach hosts behind a bastion](/guides/bastions).

## What runs on the connection

Every command runs as `/bin/sh -c` with `LC_ALL=C`, without a terminal. With `become = true`, the first command on a connection checks whether sudo needs a password, and the answer holds for that connection. [become](/reference/circuits/ssh#become) describes the check.

Some changes on one host take turns even though they arrive on separate sessions: package installs run one at a time, and so do service changes and `line` or `block` edits to the same file. Other steps on the same host, and every other host, run in parallel, up to `-parallelism`.

## Related

- [The ssh block](/reference/circuits/ssh) lists every connection setting.
- [conn3x CLI](/reference/cli#environment-variables) documents `CONN3X_SSH_MAX_SESSIONS` with the other environment variables.
