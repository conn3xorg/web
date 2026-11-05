---
title: "What an upgrade test proves, and why it's worth 5 points"
description: "A fresh install and an upgrade take different paths through a circuit, and only one of them is what you run in production. Here's the upgrade check in the circuit grade, how checkov and in-toto earned it, and why oracle-free still can't."
date: 2026-12-08
author: James Conway
---

Every circuit's CI starts from an empty host. That's the easy case, and it's almost never yours.

Yours is the host that's had version 1 on it since March. You bump the `?ref=` to version 2, run `conn3x plan`, and hope the circuit notices there's something to do. A fresh-host test can't tell you whether it will, because on a fresh host there's never anything already there.

So the [circuit grade](https://docs.conn3x.org/reference/circuit-grades) has a check for it. "Upgrade tested" is worth 5 points, and it wants a CI step named for an upgrade that runs a second apply. On 5 November, checkov and in-toto added one, and both moved from B to A.

## The bug a fresh host hides

Look at how [circuit-checkov](https://github.com/conn3xorg/circuit-checkov) installs checkov. It builds a venv from a hash-locked requirements file, then writes the lock's SHA-256 into a marker file. Next time, an `unless` guard compares the two and skips the install if they match:

```hcl
unless = "[ \"$(sha256sum < ${local.locked})\" = \"$(cat ${local.venv}/.conn3x-installed)\" ] && ${local.venv}/bin/checkov --version >/dev/null 2>&1"
```

That guard is the whole upgrade story. If it's wrong, a new release of the circuit lays down a new lock, the guard says "already done", and you keep running the old checkov while the plan tells you everything's fine.

On a fresh host the guard never matters. There's no marker, so it can only ever say "install". Every green run the circuit had before this proved nothing about it.

## What checkov's CI does now

The upgrade step starts a new host and puts an older release on it first, from its own lock in `tests/upgrade`. Then it applies the circuit as it ships:

```yaml
- name: Upgrade from checkov 3.3.30 on a fresh host, then plan again with no changes
  working-directory: examples/local
  run: |
    ./down.sh
    ./up.sh
    conn3x init
    conn3x apply -auto-approve -var checkov_version=3.3.30 -var requirements_file=../../tests/upgrade/checkov-3.3.30.txt
    test "$(sudo podman exec circuit-checkov checkov --version)" = 3.3.30
    conn3x apply -auto-approve
    conn3x plan -detailed-exitcode
    test "$(sudo podman exec circuit-checkov checkov --version)" = "$(conn3x output -raw checkov_version)"
- name: Check the upgraded checkov still reports CKV_AWS_24
  working-directory: examples/local
  run: sudo podman exec -i circuit-checkov sh < check.sh
```

Read it as three claims. The old version really went on: `checkov --version` has to print 3.3.30, or the test isn't testing anything. The new version really replaced it, and the plan after is clean. And the upgraded checkov still does its job: it flags a security group open to the world on port 22, then passes once the group is narrowed.

The older release is hash-locked too. That lock is 2,158 lines, every package pinned to the SHA-256 of every file PyPI has for it, so the "before" is as reproducible as the "after". An upgrade test that starts from whatever an index happens to serve that day isn't one you can rerun.

[circuit-in-toto](https://github.com/conn3xorg/circuit-in-toto) got the same treatment: in-toto 3.0.0 from its own lock, then 3.1.0 over it, then the full check, where a two-step build has to verify and a tampered source and a swapped tarball both have to fail.

## Why 5 points is the right size

Checkov scored 89 before the change. That's 85 of the 95 points that apply to it, and a B. The upgrade step made it 90 of 95, which is 95 and an A. In-toto went from 89 to 95 the same way.

That's a big jump for 5 points, and it's fair to ask whether the check is overweighted. I don't think so. The checks that cost the most, CI staying green, a clean second plan and a real behaviour check, are all must-pass and carry 50 points between them. Those catch a circuit that doesn't work. The upgrade check catches one that works on day one and quietly stops working on day ninety. It sits at 5, the same as a signed tag, because what it proves is narrow: one jump, from one older release, in a container. It doesn't prove every jump is safe. Checkov's README says outright that an upgrade on a real host hasn't been run.

Still, narrow is a lot better than nothing. By the end of 5 November, fifteen circuits passed it, from Uptime Kuma to Teleport. A week earlier, none did.

## Why oracle-free stays at B

[circuit-oracle-free](https://github.com/conn3xorg/circuit-oracle-free) sits at 86. Add the upgrade points and it would be 95 of 105, which is an A. So why not add them?

Every file the circuit downloads is checked against a SHA-256 it carries, and those sums come from Oracle's own download page. That page lists the current release. It doesn't publish a checksum for the older RPM an upgrade test would need to start from.

You can find old copies of that page in web archives. We could take a sum from one of those and pin it. But then the start of the test would rest on a copy of a copy, and the circuit's promise, that every byte it installs was checked against a sum from the people who made it, would have a footnote. We'd rather keep the B.

So oracle-free's README says plainly that only 23.26.3-1 has been tested. When Oracle ships the next release and 23.26.3-1 becomes the older one, its sum is the one already pinned, and the upgrade test can start from it.

## Add one to your circuit

If your circuit pins a version, you're most of the way there:

1. Keep the older version's pin in the repo, with its checksums.
2. In CI, start a clean host and apply with that pin.
3. Check the old version is what's running.
4. Apply again with the circuit's defaults, plan with `-detailed-exitcode`, and run your behaviour check.

Name the step for an upgrade so the grade can find it. The [circuit grades reference](https://docs.conn3x.org/reference/circuit-grades) has the exact rule, and your circuit's grade page shows the line it found.
