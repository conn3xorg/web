---
title: "Twenty new circuits in one day"
description: "On 5 November, twenty official circuits went up at once: eight from the planned round, from Cassandra to TruffleHog, and twelve for the software people run at home, from Uptime Kuma to Renovate. Here's each one's grade and what its CI proves."
date: 2026-12-03
author: James Conway
---

A circuit that installs something is easy to write. One that proves the thing works afterwards takes longer, and that's where most of the hours went.

On 5 November, twenty new official circuits went public. Eight were the planned round: databases, security tools and a load tester. Twelve were for the software people keep running at home, and plenty of people keep running at work. By the end of that day, nineteen graded A. One graded B, and I'll tell you why.

For each one there's a single line below on what CI checks after `conn3x apply`. Not "the service is active". What it actually does with the thing it installed. Each README has a "Tested on" section with the full story, including what hasn't been tried.

## The planned round

These eight were the next round on our list. The five command-line tools among them all install a pinned version and check it before it lands: a SHA-256 for the downloads, a hash-locked requirements file for the Python ones.

- [cassandra](https://github.com/conn3xorg/circuit-cassandra), A. Logs in with the new admin password, writes a row over CQL and reads it back, checks the default `cassandra`/`cassandra` login is refused, then restarts the host and reads the row again.
- [oracle-free](https://github.com/conn3xorg/circuit-oracle-free), B. Logs in to `FREEPDB1` as `SYSTEM` over the listener, writes and reads a row, checks a wrong password is refused, and checks a plan without the licence accepted stops. Rocky Linux 9 and 10 only.
- [k6](https://github.com/conn3xorg/circuit-k6), A. Runs five requests against a small listener on the host and checks the summary counts five, then points k6 at a closed port and expects exit code 99.
- [checkov](https://github.com/conn3xorg/circuit-checkov), A. Plants a security group open to `0.0.0.0/0` on port 22, expects `CKV_AWS_24`, narrows the group to `192.0.2.0/24` and expects a pass.
- [cosign](https://github.com/conn3xorg/circuit-cosign), A. Signs a file on the host, verifies it, checks a changed copy is refused, and checks cosign never fetched Sigstore's trust root.
- [in-toto](https://github.com/conn3xorg/circuit-in-toto), A. Runs a two-step build under a layout, then checks `in-toto-verify` accepts it and refuses both a source file changed between steps and a tarball swapped afterwards.
- [falco](https://github.com/conn3xorg/circuit-falco), A. Reads `/etc/shadow` and a canary file and checks Falco logged the right alert for each. It uses the modern eBPF probe, so it needs BTF and kernel 5.8 or later, which rules out LXC and OpenVZ.
- [trufflehog](https://github.com/conn3xorg/circuit-trufflehog), A. Plants the placeholder webhook from Slack's own documentation under `/opt`, runs the timed scan, and checks the findings name it and its file.

Oracle's B is mostly arithmetic. It runs on Rocky only, so it earns half the points for the distribution matrix, and it has no upgrade test yet. Next Tuesday's post is about that second gap, because the reason is more interesting than it sounds.

## For the homelab

Every one of these twelve runs on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13 in CI, except Teleport, which skips Fedora because Teleport doesn't publish a Fedora repository. The containerised ones run the upstream image under Podman, pinned by digest, and anything that listens does it on `127.0.0.1` until you say otherwise. And every one starts CI on the previous release and upgrades to the current one before running its check again.

- [uptimekuma](https://github.com/conn3xorg/circuit-uptimekuma), A. Creates the admin, then watches two monitors: one on Uptime Kuma itself, which has to report up, and one on a closed port, which has to report down.
- [homepage](https://github.com/conn3xorg/circuit-homepage), A. Loads the dashboard, checks a request with the wrong `Host` gets a 400, and reads a placeholder back filled in from the env file, which never touches state.
- [dockge](https://github.com/conn3xorg/circuit-dockge), A. Deploys an nginx stack through Dockge's own API on top of Podman, with no Docker engine, and fetches the page it serves.
- [portainer](https://github.com/conn3xorg/circuit-portainer), A. Signs in through an SSH tunnel that trusts only Portainer's certificate, lists the host's containers through Podman, adds the agent as a second environment and queries it.
- [passbolt](https://github.com/conn3xorg/circuit-passbolt), A. Does what the browser extension does: completes the admin's invitation with a new OpenPGP key, signs in over the GPG challenge, and checks another key's challenge is refused.
- [semaphore](https://github.com/conn3xorg/circuit-semaphore), A. Sets up a project, runs an Ansible playbook as a task, and finds the playbook's message in the output.
- [netbird](https://github.com/conn3xorg/circuit-netbird), A. Joins a self-hosted NetBird server that CI starts for itself, then has a second peer ping the host across the network.
- [teleport](https://github.com/conn3xorg/circuit-teleport), A. Builds a server and a node, then runs a command on the node through the proxy with `tsh ssh`.
- [influxdb](https://github.com/conn3xorg/circuit-influxdb), A. Writes a point with the admin token, reads it back over SQL, and checks a request without the token gets a 401.
- [homeassistant](https://github.com/conn3xorg/circuit-homeassistant), A. Finishes onboarding through the API, checks a second owner is refused, and checks port 8123 doesn't answer on the host's own address.
- [kestra](https://github.com/conn3xorg/circuit-kestra), A. Saves a flow and runs it, and the flow fails unless the secret it reads matches the one CI passed in.
- [renovate](https://github.com/conn3xorg/circuit-renovate), A. Points Renovate at a throwaway Forgejo with lodash 4.17.20 pinned, and checks it opens the update pull request.

After all of that, every one of the twelve restarts the host and runs its check again. And beyond CI, each was applied by hand to an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, then rebooted. None of the Rocky audit logs had a denial.

## What's still missing

All twenty miss one check in common, worth 5 points: none has a passing real-host workflow yet. The droplet runs above were done by hand, and the grade doesn't take my word for that, which is the point of it. A few things are plainly untested, and each README says which: Semaphore and Kestra on PostgreSQL, NetBird's cloud, Renovate against GitHub or GitLab, Cassandra with more than one node.

## Try one, or write about one

Each repo opens with a module block you can paste. The [circuit directory](/circuits) has all of them, with every grade's checks on its own page, and the [Circuit Builder](/build) puts several together for you.

And if you run one of these, we'd love a write-up. Every new repo has a "writers wanted" issue. A short post on how you set up Passbolt for your family counts.
