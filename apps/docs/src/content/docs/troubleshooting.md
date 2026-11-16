---
title: Troubleshooting
description: "What Conn3x's common errors mean and what to change: host keys, SSH keys, sudo, old SSH servers, hosts that don't answer, Windows hosts, switches and converted Ansible."
---

Find the message you got, then the fix. Each one is the text Conn3x prints, so searching this page for a few words of your error works.

## Host keys

**`host key verification failed: 192.0.2.10:22 is not in /home/you/.ssh/known_hosts; verify its key and add it, for example with ssh-keyscan`**

Conn3x checks every host's key, and there's no setting to skip it. It hasn't seen this host before. Log in once with `ssh` and compare the fingerprint with one you trust, such as the cloud console's, or add the key you already know with `ssh-keyscan`. For a host the same configuration creates, pin the key it generates in `host_key` instead; see [Connections](/reference/circuits/ssh).

**`host key verification failed: the host key for 192.0.2.10:22 changed since it was recorded in /home/you/.ssh/known_hosts`**

The host has a different key from the one you recorded. A rebuilt server does that, and so does someone in the middle. Find out which before you remove the old line from known_hosts.

**`host key verification failed: cannot read known_hosts file ...`** and **`no known_hosts file and no home directory`**

The file in `known_hosts_file` isn't there or can't be read, or the run has no home directory to find `~/.ssh/known_hosts` in, as in some CI jobs. Set `known_hosts_file` to a file you check in or write in an earlier step.

## Logging in

**`no private_key given and no SSH agent (SSH_AUTH_SOCK is not set)`**

Conn3x needs a key: set `private_key_file` in the `ssh` block, or start an agent and add your key with `ssh-add`.

**`no common algorithm`**

The host's sshd and Conn3x share no signature algorithm. Since v0.20.0, a host with a pinned RSA `host_key` must sign with SHA-2, and an old sshd that only knows `ssh-rsa` fails here. So does classic Cisco IOS. Set `legacy_algorithms = true` on that one host; it's never on by default, and jump hosts never use it.

**`proxy_command and jump hosts can't be combined: each is a way to reach the host; use one`**

Both describe how to get to the host. Keep `jump_hosts` for an SSH bastion, or `proxy_command` for a tunnel such as Session Manager or IAP; see [Hosts behind SSM or IAP](/reference/circuits/ssh#hosts-behind-ssm-or-iap).

## sudo and become

With `become = true`, every command runs through sudo. These come from sudo, and each starts with `become failed on <host>`:

| Message | Fix |
| --- | --- |
| `sudo needs a password; set become_password_file in the ssh block` | Point `become_password_file` at a file with the password, or allow the user to run sudo without one. |
| `sudo rejected the password from become_password_file (incorrect password)` | The file has the wrong password, or a trailing character you didn't mean. |
| `sudo is set to requiretty; allow this user to run sudo without a terminal (Defaults:<user> !requiretty)` | Add that line to a file under `/etc/sudoers.d/`. |
| `<user> is not in the sudoers file` | Give the user sudo, or log in as one that has it. |

Logging in as root works too: set `user = "root"` and leave `become` off.

## Hosts that don't answer

**`Host not reachable during refresh`** (a warning)

A plan couldn't reach the host to read its steps, and gave up after 10 seconds. The steps keep what the last apply recorded, so the plan goes on. `conn3x drift` treats it as an error, since a host it couldn't read can't be called unchanged. Check the address and that sshd is listening, or that its port moved.

**Many hosts behind one bastion, and logins refused**

sshd's `MaxStartups` starts refusing new logins once ten are in progress and not yet logged in. Since v0.20.0, Conn3x keeps at most eight logins in progress through any one jump host, so you shouldn't see this from a single run. Two runs at once through the same bastion can still add up; run them one after the other, or raise `MaxStartups` on the bastion.

## Windows hosts

**`<name> is a Windows host, and this circuit doesn't support it. A circuit written for Windows sets allow_windows = true on its conn3x_host data source`**

`conn3x_host` refuses Windows by default, because a circuit written for Linux would take a Windows host for something it isn't. If the circuit is meant for Windows, set `allow_windows = true` on its `conn3x_host`. [Host facts](/reference/host-facts#windows-server) has what it reads on Windows.

## Network devices

**`this login isn't privileged`** (Arista EOS)

The SSH login landed in unprivileged mode. Give the user privilege 15 and add `aaa authorization exec default local`, so a login starts in privileged mode. Conn3x never sends `enable`.

## Converted Ansible

**`TODO(convert)` lines in the output**

Each one is a task the converter didn't turn into a step, with the reason on the line. [How much of a role converts](/guides/ansible-convert-coverage) lists the reasons it hits most and which are being worked on, and the [migration guide](/guides/migrate-from-ansible) covers finishing them.

## Still stuck?

Run with `TF_LOG=DEBUG` to see how long each step took on each host. Then ask on [GitHub Discussions](https://github.com/conn3xorg/conn3x/discussions) with the command, the full error and your Conn3x version (`conn3x version`). Mask addresses and keys if you like.
