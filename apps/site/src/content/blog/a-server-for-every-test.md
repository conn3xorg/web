---
title: "A server for every test"
description: "conn3x test can start a throwaway systemd host in Podman or Docker, apply your circuit to it, check the second plan is empty and remove it. Here's the test file, and what it catches that a plan can't."
date: 2026-12-15
author: James Conway
---

You know the ritual. Change a template, spin up a VM, apply, poke at it, apply again to make sure nothing moves, then forget the VM exists until the bill reminds you. The testing was fine. Keeping a server around for it was the annoying part.

Since v0.20.0, `conn3x test` brings its own server and takes it away again.

## What a plan can't tell you

Most of a circuit you can test without any host at all. A plan already knows which package goes where and what every file will say, so an `assert` on the plan catches a wrong template or a `for_each` that dropped a host. We covered that in the [testing guide](https://docs.conn3x.org/guides/test-a-circuit/), and it's still the fastest test you'll write.

What a plan can't tell you is whether the host agrees. Does the service actually start once the config is in place? Does the second apply really change nothing, or does some step rewrite a file every time because the package touched it? You only learn that by applying to something real. That's the run that used to need a VM.

## The test file

A `conn3x_test_container` goes in a small setup module next to your tests:

```hcl
# tests/setup/main.tf
resource "conn3x_test_container" "web1" {
  image = "ghcr.io/conn3xorg/test-rocky10"
}

output "port" { value = conn3x_test_container.web1.port }
output "key" { value = conn3x_test_container.web1.private_key_file }
output "known_hosts" { value = conn3x_test_container.web1.known_hosts_file }
```

The first run loads it, and the second applies your circuit to whatever it started:

```hcl
run "host" {
  module {
    source = "./tests/setup"
  }
}

run "converge" {
  variables {
    port        = run.host.port
    key         = run.host.key
    known_hosts = run.host.known_hosts
  }
  idempotent = true
}
```

Your circuit's `ssh` block takes those three as variables and logs in at `127.0.0.1` as `root`. That's the whole setup.

Here's what happens when you run `conn3x test`. The setup run starts the image under Podman or Docker and waits for systemd to finish booting, so your services have a real init to talk to. It makes a key for root and pins the container's host key, which means the test checks host keys the same way production does, with nothing switched off. The converge run applies. `idempotent = true` plans once more and fails the test if that plan isn't empty. Then the file ends, and `conn3x test` destroys the runs in reverse: your circuit's steps first, while the container is still there to remove them from, and then the container.

No VM. Nothing left running.

## Three images, or yours

We publish `test-rocky10`, `test-debian13` and `test-ubuntu2404` under `ghcr.io/conn3xorg`. They're small: systemd, sshd, sudo and not much else, because a test host that comes with things your real servers don't have will pass tests your servers fail.

Want to know your circuit works on both families? Add a container per image in the same setup module and give the second one a host object with its own port, key and host key. All of it is in the guide, down to the outputs.

And if a container isn't real enough, the setup module doesn't have to start one. The guide also builds an EC2 instance with a pinned host key and runs the same converge against it. A cloud image's own kernel and sshd show up there and nowhere else, so for some circuits that's the test worth paying for.

## If a run gets killed halfway

It happens. Ctrl-C at the wrong moment, a CI job that hits its timeout. Every test container carries the label `io.conn3x.test-container=true`, so you can find the strays:

```sh
podman ps --filter label=io.conn3x.test-container=true
```

## Try it on a circuit you already have

Pick one you've been testing by hand. Add the setup module, add the two runs, and run `conn3x test`. If the second plan isn't empty, you've just found the step that's been quietly changing something on every apply. Better here than at 2am.

The [testing guide](https://docs.conn3x.org/guides/test-a-circuit/) has the full walkthrough, including the two-family and EC2 versions. Tell us what breaks, on [GitHub Discussions](https://github.com/conn3xorg/conn3x/discussions).
