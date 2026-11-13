---
title: Network devices
description: "How Conn3x configures switches over their own CLI: Arista EOS since v0.9.0, Juniper Junos since v0.17.0, both experimental."
---

:::note
The `eos_*` modules are in Conn3x since v0.9.0, and all of them are experimental. `eos_interface`, `eos_user` and one commit per switch are new in v0.10.0. The `junos_*` modules are new in v0.17.0, and experimental too. Earlier releases don't know the modules they lack, so a circuit that uses one fails `conn3x validate`.
:::

A switch is a host like any other in a circuit. You list it in `hosts`, reach it through the circuit's `ssh` block, and the step's module decides how Conn3x talks to it. A `package` step runs shell commands. An `eos_*` or `junos_*` step types into the switch's own CLI. There's no shell, no `sudo` and no agent on the switch, and nothing to install there.

```hcl
circuit "leafs" {
  hosts = { leaf1 = "10.0.0.11", leaf2 = "10.0.0.12" }

  ssh {
    user             = "ops"
    private_key_file = "~/.ssh/id_ed25519"
  }

  step "name" {
    eos_hostname {
      name = each.key
    }
  }

  step "vlans" {
    for_each = { users = 10, voice = 20 }
    eos_vlan {
      vlan_id = item.value
      name    = item.key
    }
  }

  step "uplink" {
    eos_config {
      parents = ["interface Ethernet1"]
      lines   = ["description uplink to core", "switchport mode trunk"]
    }
  }
}
```

Keep switches in their own circuit. An `ssh` block that suits a Linux server, with `become` for example, is refused on an `eos_*` or `junos_*` step, and `confirm_after` (below) is refused on everything else.

## What works today

Arista EOS, and since v0.17.0 Juniper Junos, which has [its own section](#juniper-junos) below. For EOS:

| Module | What it owns |
| --- | --- |
| [`eos_config`](/modules/eos_config) | Lines under a parent block, written the way `show running-config` prints them. Other lines are left alone, or with `match = "block"` the block must be exactly these lines. |
| [`eos_hostname`](/modules/eos_hostname) | The switch's hostname. |
| [`eos_interface`](/modules/eos_interface) | One interface's description, up or down, access or trunk, VLANs and MTU. Every other line under the interface is left alone. Since v0.10.0. |
| [`eos_user`](/modules/eos_user) | A local account: role, privilege, SSH key, and a password that stays out of state. Since v0.10.0. |
| [`eos_vlan`](/modules/eos_vlan) | A VLAN and its name. Removing the step deletes the VLAN. |
| [`conn3x_eos_device`](/reference/eos-device) | A data source: model, EOS version, serial and system MAC, for preconditions. |

Plan, `in_sync` and [`conn3x drift`](/guides/drift) work as they do for servers: Conn3x reads `show running-config` and compares only the lines a step owns. Lines no step names aren't drift.

All of it is [experimental](/reference/maturity). It's tested against cEOS-lab 4.37.0F, Arista's container image, on a local machine. It isn't tested in CI, because the image can't be shared there yet, and it isn't tested on hardware.

## The login

The switch has to start an SSH login in privileged mode. Give the user privilege 15 and a key, and tell EOS to honour that privilege at login:

```
username ops privilege 15 role network-admin
username ops ssh-key ssh-ed25519 AAAA...
aaa authorization exec default local
```

Without the `aaa` line, EOS starts every SSH login unprivileged, even for a privilege 15 user, and every step fails with a message that names the fix. Conn3x never types `enable` to get there instead. On a switch with an enable password, `enable` would take the next line Conn3x sends as the password.

Password logins aren't supported yet. Use a key, or the SSH agent.

## How a change is made

Every change goes through a named EOS config session, so it's all or nothing:

1. The lines go into a session, which isn't live yet. If the switch refuses any of them, the session is aborted and nothing changes.
2. The session is committed with a five-minute revert timer.
3. Conn3x waits `confirm_after`, 30 seconds by default.
4. It logs in again, over a new SSH connection, and confirms the commit.
5. The running config is saved to startup-config.

If the change cut Conn3x off, the new login fails, the confirm never arrives, and the switch rolls the change back by itself when the timer runs out. Your next apply finds the lines missing and tries again.

## Why it waits before confirming

A change doesn't take effect the instant it's committed. On cEOS-lab, turning off SSH stopped new logins 3 to 6 seconds after the commit. A confirm sent straight away gets in before that, so Conn3x would keep the very change that's about to lock it out. The wait is there so the change has bitten by the time Conn3x tests the login.

The wait has a cost, so Conn3x pays it once per switch, not once per step; see below.

Thirty seconds is a measured guess, not a guarantee. ACLs, VRF moves, AAA changes and real switch hardware can take longer to settle. Raise the wait in the circuit's `ssh` block when your changes need it:

```
ssh {
  user          = "ops"
  confirm_after = "90s"
}
```

It takes at least `"5s"` and anything under `"4m"`, so the confirm always lands before the five-minute revert.

## One commit per switch

Ten changed steps shouldn't mean ten waits, and since v0.10.0 they don't. In v0.9.0 each step was its own session, so ten changed steps cost about five minutes of waiting. Now the steps for a switch share one config session per apply:

1. Each `eos_*` step adds its lines to the switch's session. Nothing is live yet. A step with nothing to change doesn't open one.
2. Once every step for that switch is in, one commit with the revert timer makes the lot live together.
3. One `confirm_after` wait, one confirm over a new login, one save.

On cEOS-lab, a ten-step circuit with `confirm_after = "10s"` applied in 13.5 seconds. One session per step took 97.

The plan shows one extra line per switch, `conn3x_eos_commit.<circuit>__commit`, and it only changes when one of the circuit's `eos_*` steps does. It's never drift: a hand edit shows up on the step that owns the line. With `strategy = "per_host"`, each switch commits as soon as its own steps are in, without waiting for the others.

Sharing a session changes a few things:

- **A failed step drops the whole session.** The steps before it on that switch were only staged, so nothing on the switch changes. The next apply makes them again.
- **A rollback takes the whole batch.** If one step's change locks Conn3x out, the confirm never comes, and the switch rolls back every step of that apply, not just the bad one. Fix the bad step and apply again.
- **A hand edit mid-apply stops the commit.** EOS commits a session by swapping running-config for the session's copy, which would quietly undo an edit made since the session started. If running-config changed while the apply was adding lines, Conn3x aborts the session instead. Nothing changes; apply again.
- **A leftover session gets cleaned up.** An apply that's killed before its commit leaves a pending `conn3x-` session, which was never live. The next apply aborts it before it opens its own. One killed during the wait leaves a commit on its revert timer, and the next apply won't change that switch until it has rolled back.
- **Target the commit, not a step.** `-target` on a single `eos_*` step leaves the commit out, so its lines are dropped when the run ends. Target `conn3x_eos_commit.<circuit>__commit` instead; it brings the circuit's steps with it.
- **Destroying a circuit commits once too.** Its steps' removals go into one session per switch, and `conn3x_eos_removals.<circuit>__removals` commits them together. Seven VLAN steps came off in 13.2 seconds instead of about 70.
- **A step you delete from a circuit that stays** commits its removal in the run's session when one is open, and in a session of its own when nothing else on that switch changes.
- **Removals aren't lost with a failed session.** If a session that holds removals fails, such as when another run took the switch, Conn3x has already forgotten those steps, so it commits the removals on their own. If that fails too, the error lists the lines to remove by hand.

## Guards on your own login

Two modules could cut Conn3x off from the switch it's changing, so both refuse to:

- `eos_interface` won't shut down the interface that holds the address Conn3x reaches the switch at. The revert timer would undo it, but only after the full wait.
- `eos_user` won't demote or delete the account Conn3x logs in as.

Passwords and their hashes are masked in session diffs and errors, so a log never holds one.

## Juniper Junos

New in v0.17.0, and experimental like the EOS modules. Conn3x talks to Junos the way it talks to EOS, over SSH and the device's own CLI, with no NETCONF to turn on and nothing to install.

| Module | What it owns |
| --- | --- |
| [`junos_config`](/modules/junos_config) | Set statements, written the way `show configuration \| display set` prints them. Other statements are left alone, or with `match = "block"` the statements under a `prefix` must be exactly these. |
| [`junos_hostname`](/modules/junos_hostname) | The device's host name. |
| [`junos_interface`](/modules/junos_interface) | One interface's description, enabled or disabled, MTU, and on a switch port, access or trunk and its VLAN members. |
| [`junos_user`](/modules/junos_user) | A local account: login class, SSH keys, and a password that stays out of state. |
| [`junos_vlan`](/modules/junos_vlan) | A VLAN by name and its ID. Removing the step deletes the VLAN. |

A `conn3x_junos_device` data source reads the host name, model and Junos version, for preconditions.

It's tested against vJunos-switch 26.2R1.7 on a lab VM, not yet in CI and not on hardware.

### The login

Log in as a user of class `super-user`, whose login starts in the CLI:

```
set system login user ops class super-user
set system login user ops authentication ssh-ed25519 "ssh-ed25519 AAAA..."
```

`root` is refused, because its login starts in a shell.

### How a change goes in

Junos answers every command with exit status 0, even one it refused, and a script typed into its CLI can't stop halfway: after a refused line, a `commit` still commits everything else. So Conn3x reads every answer for the device's own errors, and sends each change twice.

1. **A dry run** in `configure private`: the lines, `commit check`, then `rollback` and `exit`. If the device refuses anything, Conn3x stops with the device's own words, and nothing has changed.
2. **The commit** in `configure exclusive`, with `commit confirmed 5`. Junos refuses `commit confirmed` in private mode, which is why there are two passes. If someone else holds the configuration lock, Conn3x stops, and nothing has changed.
3. **The confirm.** After `confirm_after`, Conn3x logs in again over a new connection and runs `commit check`, which confirms. If that login can't get in, Junos rolls the change back by itself within five minutes.

Commits on Junos persist, so there's no save step.

While a commit confirmed waits for its confirm, Junos says so every time you enter configuration mode, and Conn3x listens. A refresh counts the device's steps as out of sync, since their lines may yet roll back, and an apply stops before it sends anything. A session that ends mid-commit never reads as "nothing changed" either: the commit may be what cut it.

### One commit per device

As on EOS, a device's steps in a circuit share one commit per apply. Junos keeps nothing between logins, so the lines wait in Conn3x until the circuit's last step is in. Each step still runs the dry run over everything staged so far, so a refused line fails the step that brought it. On vJunos, a seven-step circuit and its destroy each made exactly one commit.

The plan shows `conn3x_junos_commit.<circuit>__commit` and `conn3x_junos_removals.<circuit>__removals`, which work like their EOS twins above.

### Guards

- `junos_interface` won't disable a management interface (`fxp0`, `em0`, `me0`, `vme`), or the interface that holds the address Conn3x connects to.
- `junos_user` won't demote or delete the account Conn3x logs in as.
- `junos_config` takes nothing but `set` statements, so no line can leave configuration mode, commit early or run another command.

## What's coming

- More EOS and Junos modules, and lines kept out of state for secrets in `eos_config` and `junos_config`.
- VyOS and classic Cisco IOS after that. See the [roadmap](/roadmap).

Until then, the provider-backed circuits work today: [RouterOS baseline](/circuits/routeros-baseline), [OPNsense VLANs](/circuits/opnsense-vlans) and [Proxmox VE network](/circuits/proxmox-network).
