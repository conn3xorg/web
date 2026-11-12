---
title: Test a circuit
description: "Write conn3x test files for a circuit: assert on what it plans without a server, fake host facts with a mock provider, and apply it for real on a container."
---

You changed a step, and you'd like to know what it does to every host before anyone runs it on a server. `conn3x test` answers that. It's OpenTofu's [test command](https://opentofu.org/docs/cli/commands/test/), and it works on circuits as it does on any other configuration: each `run` block plans or applies the circuit, then checks `assert` conditions against the result.

Most of a circuit can be tested without a server at all. A plan already says which package goes on which host and what every file will contain, so asserting on the plan catches a wrong template, a `for_each` that drops a host or a variable that doesn't reach a step. When you need to know the host really ends up that way, a run can apply to a container.

This guide uses Conn3x v0.14.0.

## Where tests go

Test files end in `.tftest.hcl` and sit next to the circuit or in a `tests` directory under it. `conn3x test` finds both. Each file starts from empty state, runs its `run` blocks in order and destroys whatever it applied at the end.

Assertions refer to steps by their [resource addresses](/reference/circuits/addresses). Step `motd` in circuit `web` is `conn3x_file.web__motd`, and `["a"]` picks host `a`. Run `conn3x plan` once if you're not sure what a step is called; the plan prints every address.

## Test what the circuit plans

Here's a small circuit, `main.circuit.hcl`, with two hosts and a variable:

```hcl
variable "greeting" {
  type    = string
  default = "Hello"
}

circuit "web" {
  hosts = { a = "192.0.2.10", b = "192.0.2.11" }

  ssh {
    user = "root"
  }

  step "nginx" {
    package {
      name = "nginx"
    }
  }

  step "motd" {
    file {
      path    = "/etc/motd"
      content = "${var.greeting} from ${each.key}\n"
    }
  }
}
```

And a test for it, `tests/web.tftest.hcl`:

```hcl
mock_provider "conn3x" {}

run "motd_names_each_host" {
  command = plan

  assert {
    condition     = conn3x_file.web__motd["a"].content == "Hello from a\n"
    error_message = "motd on host a is wrong"
  }

  assert {
    condition     = length(conn3x_package.web__nginx) == 2
    error_message = "nginx should be planned on both hosts"
  }
}

run "greeting_variable" {
  command = plan

  variables {
    greeting = "Hi"
  }

  assert {
    condition     = conn3x_file.web__motd["b"].content == "Hi from b\n"
    error_message = "greeting variable not applied"
  }
}
```

`command = plan` stops each run at the plan. The second run sets `greeting` for itself, so one file can try the same circuit with different inputs. Initialize the directory once, then run the tests:

```sh
conn3x init
conn3x test
```

```text
tests/web.tftest.hcl... pass
  run "motd_names_each_host"... pass
  run "greeting_variable"... pass

Success! 2 passed, 0 failed.
```

The hosts are documentation addresses that nothing answers on. That's fine for a plan: planning a step that isn't in state yet doesn't log in to the host, so this file would pass even without its first line. `mock_provider "conn3x" {}` makes sure nothing logs in: it swaps the real provider for a fake one, so no run in the file opens an SSH connection, whatever it plans or applies.

## When an assertion fails

Change the first condition to expect `"Hello from b\n"` and run the tests again. The failure shows the value the plan had and the difference:

```text
tests/web.tftest.hcl... fail
  run "motd_names_each_host"... fail

Error: Test assertion failed

  on tests/web.tftest.hcl line 7, in run "motd_names_each_host":
   7:     condition     = conn3x_file.web__motd["a"].content == "Hello from b\n"
    ├────────────────
    │ conn3x_file.web__motd["a"].content is "Hello from a\n"
    ├────────────────
    │ Diff: 
    │     <<-EOT
    │       - Hello from a
    │       + Hello from b
    │     EOT

motd on host a is wrong
  run "greeting_variable"... pass

Failure! 1 passed, 1 failed.
```

`conn3x test` exits with `1` when any run fails and `0` when they all pass, so a CI job needs nothing more than the command.

To show the results in a CI dashboard as well, write them as JUnit XML. New in v0.15.0:

```sh
conn3x test -junit-xml=results.xml
```

Each test file is a test suite, and each `run` block a test case, with a run's errors under its failure. The terminal output and the exit code stay the same, unless the file can't be written, which exits 1.

## Fake the host facts

A circuit that reads [host facts](/reference/host-facts) is the one place a plan does log in: `conn3x_host` reads the host over SSH while planning. Without a mock, a test against an address nobody answers on waits for the connection and then fails:

```text
Error: Invalid ssh

  with data.conn3x_host.facts["web1"],
  on main.circuit.hcl line 5, in data "conn3x_host" "facts":
   5: data "conn3x_host" "facts" {

ssh 192.0.2.10:22: dial tcp 192.0.2.10:22: i/o timeout (still not reachable
after 3m0s)
```

With a mock, you choose the facts. This circuit picks the Apache package from the host's family:

```hcl
locals {
  hosts = { web1 = "192.0.2.10" }
}

data "conn3x_host" "facts" {
  for_each = local.hosts
  ssh {
    host = each.value
    user = "root"
  }
}

circuit "web" {
  hosts = local.hosts

  ssh {
    user = "root"
  }

  step "apache" {
    package {
      name = data.conn3x_host.facts[each.key].os_family == "debian" ? "apache2" : "httpd"
    }
  }
}
```

The test gives every host Red Hat facts by default with `mock_data`, then overrides one host to Debian for a single run with `override_data`:

```hcl
mock_provider "conn3x" {
  mock_data "conn3x_host" {
    defaults = {
      os_family = "redhat"
    }
  }
}

run "redhat_gets_httpd" {
  command = plan

  assert {
    condition     = conn3x_package.web__apache["web1"].name == "httpd"
    error_message = "a Red Hat host should get httpd"
  }
}

run "debian_gets_apache2" {
  command = plan

  override_data {
    target = data.conn3x_host.facts["web1"]
    values = {
      os_family = "debian"
    }
  }

  assert {
    condition     = conn3x_package.web__apache["web1"].name == "apache2"
    error_message = "a Debian host should get apache2"
  }
}
```

```text
tests/facts.tftest.hcl... pass
  run "redhat_gets_httpd"... pass
  run "debian_gets_apache2"... pass

Success! 2 passed, 0 failed.
```

That's both branches of the conditional tested, without a Debian server or a Rocky one.

## Apply it on a container

A plan can only tell you what Conn3x means to do. To find out whether the host ends up that way, leave out `command = plan` and the mock, and point the test at a real host. The container from [Try Conn3x locally](/tutorials/try-locally) is the cheapest one to hand. Start it from that tutorial's example directory:

```sh
cd conn3x/examples/try-it-locally
./up.sh
conn3x init
```

Then add `tests/try.tftest.hcl`:

```hcl
run "configure_the_box" {
  assert {
    condition     = conn3x_package.try__tools["box"].installed_version != ""
    error_message = "tree was not installed."
  }

  assert {
    condition     = conn3x_user.try__deploy_user["box"].home == "/home/deploy"
    error_message = "The deploy user has the wrong home directory."
  }

  assert {
    condition     = conn3x_file.try__motd["box"].sha256 == sha256("Hello from box, set up by Conn3x.\n")
    error_message = "/etc/motd on the host doesn't match the circuit."
  }
}
```

A run without `command` applies, so these conditions check what the host reported back: the version of `tree` that `dnf` installed, the home directory `useradd` gave `deploy`, and the checksum of the file as it landed.

```sh
conn3x test
```

```text
tests/try.tftest.hcl... pass
  run "configure_the_box"... pass

Success! 1 passed, 0 failed.
```

Add `-verbose` to print the state each run left behind, the same view `conn3x show` gives. If the container isn't running, the run fails once the SSH retries run out:

```text
Error: Invalid ssh

  with conn3x_package.try__tools["box"],
  on main.circuit.hcl line 12, in circuit "try":
  12:     package {

ssh 127.0.0.1:2222: dial tcp 127.0.0.1:2222: connect: connection refused
(still not reachable after 3m0s)
```

### Check that a second plan is empty

The check that matters most before you [share a circuit](/guides/share-a-circuit) is that a plan after the apply says `No changes.` Since v0.12.0, a run does that check for you when you set `idempotent = true`:

```hcl
run "configure_the_box" {
  idempotent = true
}
```

After the apply, the run plans again. If that plan would change anything, the run fails and names each resource and what would happen to it:

```text
Error: Not idempotent

The plan after the apply isn't empty:
  - conn3x_command.try__migrate["box"] would be updated in-place
```

`idempotent` needs a run that applies, so it's an error with `command = plan`. It also can't be combined with `replace` in `plan_options`.

### What the clean-up leaves on the host

When the file finishes, `conn3x test` destroys what it applied, and destroying a step does what its [`on_remove`](/reference/circuits/removal) says. Most modules default to `"forget"`, so after the run above `tree`, the `deploy` user and `/etc/motd` are all still on the container. Conn3x only dropped them from the test's state.

That's what you want on a throwaway container: `./down.sh` removes the lot, and `./up.sh` gives the next test a clean host. If the circuit sets `on_remove = "delete"` on its steps, the clean-up undoes them too. With that set on all three steps here, the container has no `tree`, no `deploy` and no `/etc/motd` after the test. Never point an apply test at a server you care about.

## What conn3x test doesn't cover

- **Values from earlier runs in assertions.** A later run can use an earlier run's outputs as `run.<name>.<output>` in its `variables` block, but not in an `assert` condition, and it can't see the earlier run's steps at all. Add an `output` to the circuit for anything you want to carry from one run to the next.
- **Made-up attributes under a mock.** The mock invents values for attributes the host would report, such as `revision`, `installed_version` and `uid`. Assert on what the circuit sets, and on host-reported attributes only in runs against a real host.
- **Services on the tutorial container.** It runs `sshd` without systemd, so `service` steps and handlers fail there with `System has not been booted with systemd as init system`. Test those plan-only, or on a host that boots systemd.
