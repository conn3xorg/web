---
title: How plan reads hosts
description: What a refresh does for each host step, which ssh settings it connects with, what happens when a host doesn't answer, and what -refresh=false skips.
---

A plan has two halves. First it refreshes state: OpenTofu asks each resource's provider to read the real object and report what it found. Then it compares what was read with your configuration. Every host step is a resource of the built-in `conn3x` provider, so on a host step the read happens over SSH. This page describes that read.

## What a read does

For each step instance in state, the refresh does the following:

1. It takes the `ssh` block recorded in state for that instance, not the one in your configuration. State holds the settings of the last apply, which are the ones known to reach the host.
2. It gets a connection to the host from the [connection pool](/internals/connections), dialing one if there is none yet. This happens for every step instance, including the ones that have nothing to read.
3. It runs the module's read commands on the host, such as reading a file or asking the package manager about a package.
4. It returns a new state for the instance, built from what it read.

The plan then compares that new state with your configuration. A difference becomes a change in the plan, and `conn3x drift` reports it as drift.

What each module reads depends on what it manages. Some examples:

| Step | What the read checks |
| --- | --- |
| `file`, `template` | Whether the file exists, its content, mode, owner and group. A file that's gone reads as no object, so the plan creates it again. |
| `package` | Whether the package is installed, and at which version. |
| `service` | Whether the unit is running and enabled. |
| `command` | The `creates`, `removes` and `unless` guards. A command without guards runs nothing on the host during a refresh. |
| `reboot` | Nothing. A reboot leaves no state on the host to read. |
| A handler | Nothing. See [Revision and handlers](/internals/revision-and-handlers). |

A step that isn't in state yet isn't read. Planning it as a create needs no connection, so a host that doesn't exist yet, such as a server created in the same apply, doesn't hold up the plan.

Planning itself never connects to a host. Once the refresh is done, comparing state with configuration happens on your machine.

## Reads run in parallel

Each step instance is read on its own, so the reads for different steps and different hosts run at the same time, up to `-parallelism` (10 by default). Reads of the same host share one SSH connection, and each read runs its commands in sessions on it. [Connection pooling and host keys](/internals/connections) explains the session limit.

## When a host doesn't answer

A refresh gives a host less time than an apply does. Before reading a step, it checks that the host answers, and waits at most 10 seconds for it, or the `ssh` block's `timeout` if that's shorter. Within that time it keeps retrying, as an apply would.

If nothing answers in that time, the step keeps the state the last apply recorded, and the plan shows a warning:

```text
Warning: Host not reachable during refresh

Nothing answered at 203.0.113.10:22, so this step keeps what the last apply recorded. If sshd has moved to the address or port in your configuration, the plan uses that one. If the host is down, applying will fail to connect to it.
```

When the host is reached through jump hosts, the warning names them too.

Conn3x remembers the host as unreachable for the rest of the command. Its other steps keep their state at once, with the same warning, instead of waiting 10 seconds each. What it remembers is the whole path: the address, the jump hosts, how its host key is checked, and the login user. The same address reached another way is tried again.

Only a host that gives no answer is treated this way: one that refuses or resets the connection, can't be routed to, or times out. Anything the host says back still fails the plan at once:

- a host key that isn't in the known_hosts file, or doesn't match it or `host_key`;
- a login that the server rejects;
- a host name that DNS says doesn't exist.

### Why the warning exists

A refresh uses the settings in state, so after you move sshd to another port and change `port` to match, the refresh still knocks on the old port. Without the 10-second limit, the plan would wait the whole `timeout` for each step and then fail. With it, the steps keep their state and the plan moves them to the new port, as described in [Moving a host to another address or port](/reference/circuits/ssh#moving-a-host-to-another-address-or-port).

The same warning appears for a host that's simply down. Its steps plan as unchanged, because nothing new was read. Read the warning before you apply: the apply connects with the settings in your configuration and the full `timeout`, and fails if the host still doesn't answer.

### In conn3x drift

[`conn3x drift`](/reference/cli/drift) runs a refresh-only plan and reports each `Host not reachable during refresh` warning as an error, because a host it couldn't read can't be called unchanged. Drift then exits with status 1.

## -refresh=false

`conn3x plan -refresh=false` and `conn3x apply -refresh=false` skip the refresh. No step is read and no connection is made for the steps during the plan. The plan compares your configuration with state as the last apply left it.

That has two effects on hosts:

- Changes made on a host by hand don't show up, so the plan doesn't put them back.
- Because nothing on the host looks changed, no step's `revision` changes for drift, and no handler runs for it. See [Revision and handlers](/internals/revision-and-handlers#drift).

Changes you make in the configuration are still planned and applied as usual. Use `-refresh=false` to plan quickly when you know the hosts haven't changed, or when a host is down and you want to plan the rest.

## Related

- [conn3x plan](/reference/cli/plan) lists every option.
- [Find drift](/guides/drift) shows how to check hosts for hand-made changes.
- [State layout for host steps](/internals/state) describes what a read returns.
