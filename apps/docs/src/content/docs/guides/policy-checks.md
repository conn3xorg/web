---
title: Check a plan against your policies
description: Fail a plan in CI when a circuit opens SSH to the world or fetches over plain HTTP, with Conftest and a few lines of Rego.
---

Review catches most mistakes in a circuit, but not every one, and not in circuits you didn't write. A policy check reads the saved plan before apply and fails the job when something breaks a rule your team agreed on, whoever wrote the step.

This guide writes three such rules in Rego and runs them with [Conftest](https://www.conftest.dev/):

- No SSH open to the world through a `ufw` or `firewalld` step.
- Every `download` comes over HTTPS.
- Every package `repository` is served over HTTPS.

The output below is from Conftest 0.71.1 (OPA 1.21.1), on a plan for one Ubuntu 24.04 host.

## Host steps in the plan

Save a plan and turn it into JSON:

```sh
conn3x plan -out=tfplan
conn3x show -json tfplan > plan.json
```

Every host step is in `resource_changes`, like any other resource. A step's address tells you where it came from:

```text
conn3x_ufw_rule.web__ssh_ufw["web1"]
```

- The type is `conn3x_` followed by the step's kind: `conn3x_ufw_rule`, `conn3x_firewalld`, `conn3x_download`, `conn3x_repository`.
- The name is the circuit, two underscores, then the step: circuit `web`, step `ssh_ufw`.
- The index is the host's name from `hosts`: `web1`. A step with its own `for_each` adds the item after a slash, such as `web1/users`, and a FAIL line then reads "on web1/users". The address Conn3x connects to is in `change.after.ssh.host`.

The step's arguments are in `change.after`, with `null` for those you didn't set. `change.actions` says what the plan does to the step: `["create"]`, `["update"]`, `["delete"]`, or `["delete", "create"]` for a replacement. Steps being removed have nothing to check, so the policies below look only at steps being created or changed.

Some values can't be checked in a plan:

- **Write-only arguments,** such as a file's `content_wo`, are always `null` in the plan. They never reach the plan or state, so no policy can read them.
- **Values known only at apply,** such as a URL built from a resource created in the same run, are missing from `change.after` and listed in `change.after_unknown`. The HTTPS policies below fail on them rather than let them through.

:::caution
`plan.json` holds every value in the plan, sensitive ones included. Don't upload it as a build artifact or print it in a log.
:::

## The policies

Put the policies in a `policy` directory next to your configuration, which is where Conftest looks by default. Conftest runs every `deny` rule in package `main`, and each message a rule returns is one failure.

The first file collects the host steps once, so the rules don't each repeat the address parsing:

```text
# policy/steps.rego
package main

# Every host step that this plan creates or changes, with its circuit,
# step and host taken from the address: conn3x_ufw_rule.web__ssh["web1"].
steps contains s if {
	some rc in input.resource_changes
	startswith(rc.type, "conn3x_")
	some a in rc.change.actions
	a in {"create", "update"}
	i := indexof(rc.name, "__")
	i > 0
	s := {
		"type": rc.type,
		"where": sprintf("%s, step %s on %s", [substring(rc.name, 0, i), substring(rc.name, i + 2, -1), rc.index]),
		"after": rc.change.after,
	}
}
```

### No SSH open to the world

A `ufw` step opens SSH to everyone when it allows or limits port 22 without `from`. A port range such as `20:30/tcp` counts too. A `firewalld` step has no source of its own: it opens the port to whoever its zone takes in, so the rule flags SSH in the default zone, `public` and `external`.

```text
# policy/ssh.rego
package main

anywhere := {null, "any", "0.0.0.0/0", "::/0"}

deny contains msg if {
	some s in steps
	s.type == "conn3x_ufw_rule"
	s.after.action in {"allow", "limit"}
	s.after.from in anywhere
	opens_22(split(s.after.port, "/")[0])
	msg := sprintf("%s: ufw opens SSH to anyone. Set from to the addresses that need it.", [s.where])
}

# firewalld steps have no source, so a zone that takes everyone, or the
# default zone, opens SSH to everyone.
deny contains msg if {
	some s in steps
	s.type == "conn3x_firewalld"
	s.after.zone in {null, "public", "external"}
	firewalld_ssh(s.after)
	msg := sprintf("%s: firewalld opens SSH in a zone open to everyone. Use a zone with only your sources in it.", [s.where])
}

firewalld_ssh(a) if a.service == "ssh"

firewalld_ssh(a) if opens_22(split(a.port, "/")[0])

opens_22(p) if p == "22"

opens_22(p) if {
	r := regex.split("[:-]", p)
	count(r) == 2
	to_number(r[0]) <= 22
	to_number(r[1]) >= 22
}
```

If your hosts' default zone isn't `public`, or you keep SSH in a zone of your own, change the zone list to match.

### Downloads and repositories over HTTPS

A `download` step always has a `sha256`, since the step requires one, so a changed file never installs. Plain HTTP still tells anyone on the path what each host fetches, and a repository's packages are only as safe as the key you trusted it with. Both rules ask for HTTPS:

```text
# policy/https.rego
package main

deny contains msg if {
	some s in steps
	s.type == "conn3x_download"
	url := object.get(s.after, "url", "a URL known only at apply")
	not startswith(url, "https://")
	msg := sprintf("%s: download fetches %s without TLS. Use https.", [s.where, url])
}

deny contains msg if {
	some s in steps
	s.type == "conn3x_repository"
	url := object.get(s.after, "url", "a URL known only at apply")
	not startswith(url, "https://")
	msg := sprintf("%s: repository %s is served without TLS. Use https.", [s.where, url])
}
```

`conn3x lint` rule `C3X001` checks the checksum side while you write the circuit: it flags a `windows_package` with a `url` and no `sha256`. Use lint as you write, and the policy as the gate on the plan in CI, where it also covers circuits you didn't write.

## Run it

This circuit breaks all three policies:

```hcl
circuit "web" {
  hosts = { web1 = "203.0.113.10" }

  step "ssh_ufw" {
    ufw {
      action = "allow"
      port   = "22/tcp"
    }
  }

  step "ssh_firewalld" {
    firewalld {
      service = "ssh"
    }
  }

  step "tool" {
    download {
      url    = "http://example.com/tool.tar.gz"
      dest   = "/opt/tool.tar.gz"
      sha256 = "0000000000000000000000000000000000000000000000000000000000000000"
    }
  }

  step "repo" {
    repository {
      name   = "example"
      url    = "http://packages.example.com/apt"
      key    = file("./key.asc")
      suites = ["noble"]
    }
  }
}
```

Each failure names the circuit, the step and the host, and Conftest exits `1`:

```text
$ conftest test plan.json
FAIL - plan.json - main - web, step repo on web1: repository http://packages.example.com/apt is served without TLS. Use https.
FAIL - plan.json - main - web, step ssh_firewalld on web1: firewalld opens SSH in a zone open to everyone. Use a zone with only your sources in it.
FAIL - plan.json - main - web, step ssh_ufw on web1: ufw opens SSH to anyone. Set from to the addresses that need it.
FAIL - plan.json - main - web, step tool on web1: download fetches http://example.com/tool.tar.gz without TLS. Use https.

4 tests, 0 passed, 0 warnings, 4 failures, 0 exceptions
```

Fix the circuit: set `from = "10.0.0.0/8"` on the ufw rule, `zone = "internal"` on the firewalld one, and `https://` on both URLs. Plan again, and the same check exits `0`:

```text
$ conftest test plan.json
4 tests, 4 passed, 0 warnings, 0 failures, 0 exceptions
```

## Test the policies

Rego rules are code, so give them tests. Conftest runs every `test_` rule in the policy directory with `conftest verify`. Each test hands a rule a small plan of its own:

```text
# policy/policy_test.rego
package main

rc(type, actions, after) := {"resource_changes": [{"type": type, "name": "web__s", "index": "web1", "change": {"actions": actions, "after": after}}]}

test_ufw_range_with_22 if count(deny) == 1 with input as rc("conn3x_ufw_rule", ["create"], {"action": "allow", "from": null, "port": "20:30/tcp"})

test_ufw_deny_22 if count(deny) == 0 with input as rc("conn3x_ufw_rule", ["create"], {"action": "deny", "from": null, "port": "22"})

test_unknown_url if count(deny) == 1 with input as rc("conn3x_download", ["create"], {"dest": "/opt/x"})

test_removed_step if count(deny) == 0 with input as rc("conn3x_download", ["delete"], null)
```

```text
$ conftest verify
4 tests, 4 passed, 0 warnings, 0 failures, 0 exceptions, 0 skipped
```

## Run it in CI before apply

Run the check in the job that plans, and apply only the plan that passed. In GitHub Actions, after the steps that install Conn3x, set up SSH and run `conn3x init` (see [Catch drift in CI](/tutorials/drift-in-ci)):

```yaml
      - name: Install Conftest
        env:
          VERSION: 0.71.1
        run: |
          BASE="https://github.com/open-policy-agent/conftest/releases/download/v${VERSION}"
          curl -fsSLO "$BASE/conftest_${VERSION}_Linux_x86_64.tar.gz"
          curl -fsSLO "$BASE/checksums.txt"
          sha256sum --check --ignore-missing checksums.txt
          tar -xzf "conftest_${VERSION}_Linux_x86_64.tar.gz" conftest
          sudo install conftest /usr/local/bin/

      - name: Plan
        run: |
          conn3x plan -input=false -no-color -out=tfplan
          conn3x show -json tfplan > plan.json

      - name: Check the plan
        run: |
          conftest verify
          conftest test plan.json
```

Pin the Conftest version, as above. A newer OPA can change how a policy evaluates, and the check should change only when you change it.

When the check fails, the job stops before apply and its log has one `FAIL` line per step that broke a rule. Fix the circuit, or change the policy if the rule is wrong, and push again.
