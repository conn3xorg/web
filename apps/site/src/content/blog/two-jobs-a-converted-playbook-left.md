---
title: "The two jobs a converted playbook still left for review"
description: "Conn3x v0.31.0 adds iptables_rule and pam_rule, so the firewall rules and PAM edits in a hardening playbook convert into steps instead of TODOs. Here's what converts, what still doesn't, and why the converter would rather hand you a task than guess."
date: 2026-12-22
author: James Conway
---

Until v0.31.0, running `conn3x convert ansible` on a hardening playbook left the same two jobs at the bottom of the file, commented out. One was the firewall on a host with neither firewalld nor ufw, kept in plain iptables. The other was the handful of lines in `/etc/pam.d` that lock an account after a few bad passwords. Conn3x had no step for either, so every `ansible.builtin.iptables` and `community.general.pamd` task went to you.

Now each has a step: `iptables_rule` and `pam_rule`. Most of those tasks convert. The ones that don't still tell you why, and the reasons are worth a minute, because each marks a place where a step would have done more than your playbook did.

## A playbook, before and after

Here's a small one, the kind that lives in a role called `harden`:

```yaml
- name: Harden the bastion
  hosts: bastion
  become: true
  tasks:
    - name: Let SSH in
      ansible.builtin.iptables:
        chain: INPUT
        protocol: tcp
        destination_port: "22"
        ctstate: NEW
        jump: ACCEPT
        comment: ssh
        ip_version: both

    - name: Slow down ping floods
      ansible.builtin.iptables:
        chain: INPUT
        protocol: icmp
        limit: 10/second
        jump: ACCEPT

    - name: Lock accounts after failed logins
      community.general.pamd:
        name: common-auth
        type: auth
        control: "[success=1 default=ignore]"
        module_path: pam_unix.so
        new_type: auth
        new_control: required
        new_module_path: pam_faillock.so
        module_arguments: preauth
        state: before

    - name: No empty passwords
      community.general.pamd:
        name: common-auth
        type: auth
        control: "[success=1 default=ignore]"
        module_path: pam_unix.so
        module_arguments: nullok
        state: args_absent
```

The v0.31.0 converter exits 3, meaning it converted what it could and left the rest for you, and says so up front:

```text
Converted 2 tasks. 2 things need you; each is marked TODO(convert):
  line 15, Slow down ping floods: sets limit, which iptables_rule doesn't offer yet
  line 22, Lock accounts after failed logins: sets module_arguments with state before; pamd gives them only to a rule it inserts and leaves one that's already next to the anchor as it is, and a pam_rule step would set them on that rule too, so write it by hand with arguments
```

It also writes variables for the hosts and the SSH login. Here's the circuit itself, as printed, with the two TODO blocks cut short:

```hcl
circuit "harden_the_bastion" {
  hosts = var.bastion_hosts

  ssh {
    user             = var.ssh_user
    private_key_file = var.ssh_private_key_file
    become           = true
  }

  step "let_ssh_in_ipv4" {
    iptables_rule {
      ip_version       = "ipv4"
      chain            = "INPUT"
      protocol         = "tcp"
      destination_port = "22"
      ctstate          = ["NEW"]
      jump             = "ACCEPT"
      comment          = "ssh"
    }
  }

  step "let_ssh_in_ipv6" {
    iptables_rule {
      ip_version       = "ipv6"
      chain            = "INPUT"
      protocol         = "tcp"
      destination_port = "22"
      ctstate          = ["NEW"]
      jump             = "ACCEPT"
      comment          = "ssh"
    }
  }

  # TODO(convert): Task "Slow down ping floods" (harden.yml line 15) sets limit, which iptables_rule doesn't offer yet.
  #   (the task follows, commented out)

  # TODO(convert): Task "Lock accounts after failed logins" (harden.yml line 22) sets module_arguments with state before; ...
  #   (the task follows, commented out)

  step "no_empty_passwords" {
    pam_rule {
      service   = "common-auth"
      type      = "auth"
      control   = "[success=1 default=ignore]"
      module    = "pam_unix.so"
      arguments = ["nullok"]
      state     = "args_absent"
    }
  }
}
```

In the real file each TODO carries its whole reason and the original task. Notice that `ip_version: both` became two steps. One step is one rule for one version, `iptables` or `ip6tables`, so a rule for both is two.

## One rule, and the rest of the chain left alone

What `iptables_rule` owns is a single rule in a single chain. Whatever else is in INPUT, Docker's rules or an old script's, stays where it is. Every refresh runs `iptables -C` with the rule's own arguments, so if somebody deletes your SSH rule by hand, the next plan shows it out of sync and the next apply puts it back.

Then there's reboot. Ansible's `iptables` module doesn't save rules, so the converted step doesn't either, and after a restart the rule is gone. Here's what you add:

```hcl
step "let_ssh_in_ipv4" {
  iptables_rule {
    ip_version       = "ipv4"
    chain            = "INPUT"
    protocol         = "tcp"
    destination_port = "22"
    ctstate          = ["NEW"]
    jump             = "ACCEPT"
    comment          = "ssh"
    persist          = true
    confirm_after    = "60s"
  }
}
```

`persist = true` saves the table with `iptables-save` after every change, to the file iptables-persistent loads at boot on Debian and Ubuntu, or the one iptables-services loads on the Red Hat family. If neither package is installed, the step fails and names both, rather than write a file nothing will ever read. One thing to know: the save holds every rule in that table, not only the ones Conn3x added.

`confirm_after` is for the rule that could cut you off. Before the change, the host schedules its own undo. Afterwards Conn3x logs in again over a new connection and cancels it. If that login never comes, the host takes the change back by itself.

Some tasks still stay for review, each with its reason: `policy`, `flush` and `chain_management`, which change a whole chain rather than one rule; `goto` and the NAT options `to_ports`, `to_destination` and `to_source`, which the step doesn't carry yet; `limit`; `state: absent`; and any value negated with `!`.

One behaviour came out of review rather than design. Foothills Digital ran iptables 1.8.11 in a Debian 13 container and found that `iptables -C` on a chain that doesn't exist answers "Bad rule", exit 1, on both the nf_tables and legacy backends. That's the same answer as a missing rule. The first draft of the docs said a refresh would fail on a missing chain; it doesn't. So now it's written down as it happens: the plan shows the rule to add, and the apply fails naming the chain.

## PAM, where one wrong line locks everyone out

`pam_rule` finds a rule the way `pamd` does, by type, control and module, and it leaves comments, `@include` lines and every other rule byte for byte. The `nullok` task converted cleanly. The faillock one didn't, and here's why.

With `state: before`, `pamd` gives `preauth` only to a rule it inserts. If `pam_faillock.so` is already sitting in front of `pam_unix.so` without `preauth`, `pamd` leaves it alone. A `pam_rule` step would make `preauth` its arguments. That's more than your play did, and the converter's rule is that a step may do what the task does, or less, never more. So you write this one yourself:

```hcl
step "lock_accounts_after_failed_logins" {
  pam_rule {
    service   = "common-auth"
    type      = "auth"
    control   = "required"
    module    = "pam_faillock.so"
    arguments = ["preauth"]
    before    = "auth [success=1 default=ignore] pam_unix.so"
  }
}
```

Putting it before the jumping rule is the safe side. `[success=1]` counts rules, so a rule added after `pam_unix.so` would change where the jump lands.

The step refuses a few things outright. It won't take out the last `auth` rule in a file, and it won't write a file it couldn't read back. A line it can't parse is an error, naming the line, because it won't guess what PAM makes of it. And on Rocky Linux, AlmaLinux and RHEL, it won't touch the files authselect manages, `system-auth` and `password-auth` among them. authselect writes those again on its next `apply-changes`, and `pamd`'s own docs say it doesn't handle authselect profiles, so a playbook editing them was making a change that wouldn't last. The error points you at `authselect enable-feature with-faillock`, which you can run from a `command` step.

Before you apply any change to an `auth` or `account` rule, open a second root session on the host and keep it open until a fresh login works. When Conn3x logs in with a key, sshd skips the `auth` rules, so a clean plan doesn't prove a password login still works.

## What we tested, and what we didn't

Both steps run end to end on Rocky Linux 10 and Ubuntu 24.04, in Podman containers. For `iptables_rule`, the test puts a rule on, deletes it by hand, watches the plan catch it and the apply restore it, then checks the saved file. A container can't reboot, so persistence is tested by what's in the saved file, not by a real reboot. For `pam_rule`, a test user signs in with a password through the edited stack before and after each change, with `pamtester`. Those password checks ran on rootful Podman; CI's rootless Podman can't verify passwords there, so CI skips just those checks and runs the rest. A host with SELinux enforcing hasn't been tried with `pam_rule` yet.

Both steps are [experimental](https://docs.conn3x.org/reference/maturity) for now, which means their arguments can still change between releases. So try both on a lab host first, the way you would any new firewall or PAM change.

## Try it

Run `conn3x convert ansible` on your own hardening playbook and read the TODO lines; they're the to-do list. The [`iptables_rule`](https://docs.conn3x.org/modules/iptables_rule) and [`pam_rule`](https://docs.conn3x.org/modules/pam_rule) pages have every argument, and the [v0.31.0 release notes](https://github.com/conn3xorg/conn3x/releases/tag/v0.31.0) have the rest of the release.

Thanks to Foothills Digital, who reviewed both steps against real iptables and real `/etc/pam.d` files from Debian 13 and Rocky 10.
