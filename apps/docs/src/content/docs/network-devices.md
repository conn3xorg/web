---
title: Network devices
description: "How Conn3x configures switches over their own CLI: Arista EOS first, experimental, arriving in the next release."
---

:::note[Arriving in the next release]
Everything on this page is on `main` and arrives in the next release. The current release doesn't have the `eos_*` modules yet.
:::

A switch is a host like any other in a circuit. You list it in `hosts`, reach it through the circuit's `ssh` block, and the step's module decides how Conn3x talks to it. A `package` step runs shell commands. An `eos_*` step types into the switch's own CLI. There's no shell, no `sudo` and no agent on the switch, and nothing to install there.

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

Keep switches in their own circuit. An `ssh` block that suits a Linux server, with `become` for example, is refused on an `eos_*` step, and `confirm_after` (below) is refused on everything else.

## What works today

Arista EOS, and only that so far:

| Module | What it owns |
| --- | --- |
| [`eos_config`](/modules/eos_config) | Lines under a parent block, written the way `show running-config` prints them. Other lines are left alone, or with `match = "block"` the block must be exactly these lines. |
| [`eos_hostname`](/modules/eos_hostname) | The switch's hostname. |
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

Each step's change goes through a named EOS config session, so it's all or nothing:

1. The lines go into a new session, which isn't live yet. If the switch refuses any of them, the session is aborted and nothing changes.
2. The session is committed with a five-minute revert timer.
3. Conn3x waits `confirm_after`, 30 seconds by default.
4. It logs in again, over a new SSH connection, and confirms the commit.
5. The running config is saved to startup-config.

If the change cut Conn3x off, the new login fails, the confirm never arrives, and the switch rolls the change back by itself when the timer runs out. Your next apply finds the lines missing and tries again.

## Why it waits before confirming

A change doesn't take effect the instant it's committed. On cEOS-lab, turning off SSH stopped new logins 3 to 6 seconds after the commit. A confirm sent straight away gets in before that, so Conn3x would keep the very change that's about to lock it out. The wait is there so the change has bitten by the time Conn3x tests the login.

The wait has a cost. Today each step is its own session, so it's paid once per step that changes: about 30 seconds each, or five minutes for a switch with ten changed steps.

Thirty seconds is a measured guess, not a guarantee. ACLs, VRF moves, AAA changes and real switch hardware can take longer to settle. Raise the wait in the circuit's `ssh` block when your changes need it:

```
ssh {
  user          = "ops"
  confirm_after = "90s"
}
```

It takes at least `"5s"` and anything under `"4m"`, so the confirm always lands before the five-minute revert.

## What's coming

- **One session per switch per apply.** Every `eos_*` step for a switch goes into one session, with one commit, one wait and one confirm, so the wait is paid once rather than per step.
- More EOS modules: interfaces, with a check that refuses changes to the management interface at plan; local users; and lines kept out of state for secrets.
- Junos, VyOS and classic Cisco IOS after that. See the [roadmap](/roadmap).

Until then, the provider-backed circuits work today: [RouterOS baseline](/circuits/routeros-baseline), [OPNsense VLANs](/circuits/opnsense-vlans) and [Proxmox VE network](/circuits/proxmox-network).
