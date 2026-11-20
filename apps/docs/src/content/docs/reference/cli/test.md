---
title: conn3x test
description: "Run a circuit's .tftest.hcl files, with what Conn3x adds to OpenTofu's test: JUnit XML for CI, an idempotency check, and a container the test starts itself."
---

`conn3x test` runs the `.tftest.hcl` files in a configuration, as [OpenTofu's `test`](https://opentofu.org/docs/cli/commands/test/) does: each `run` block plans or applies, then checks its assertions. Conn3x adds three things on top, for testing a circuit. [Test a circuit](/guides/test-a-circuit) walks through writing the tests; this page lists what's different from OpenTofu's command.

## Usage

```sh
conn3x test [-junit-xml=results.xml] [-filter=FILE] [-verbose] [-json]
```

Every option OpenTofu's `test` has works the same way. `conn3x test -help` lists them all.

## What Conn3x adds

**`-junit-xml=FILE`** writes the results as JUnit XML, for CI dashboards: a test suite per test file, a test case per `run` block, and each failure's errors. New in v0.15.0.

```sh
conn3x test -junit-xml=results.xml
```

**`idempotent = true`** on a `run` block plans again after the apply and fails the run with `Not idempotent` if that plan isn't empty. That's the check that matters most before you share a circuit. It needs a run that applies, so it's an error with `command = plan`, and it can't be combined with `replace` in `plan_options`. New in v0.12.0.

**`conn3x_test_container`** starts a systemd container for the test to apply to, and removes it when the file is done. Put it in a small setup module, and point the circuit at its outputs. It needs Podman or Docker on the machine running the test. New in v0.20.0. [Let the test start its own host](/guides/test-a-circuit#let-the-test-start-its-own-host) shows a whole file.

## Host steps under a mock

`mock_provider "conn3x" {}` swaps the real provider for a fake one, so no `run` in the file opens an SSH connection, whatever it plans or applies. Use it to test what a circuit plans without a server, and to fake the host facts a circuit reads. [Fake the host facts](/guides/test-a-circuit#fake-the-host-facts) shows how.
