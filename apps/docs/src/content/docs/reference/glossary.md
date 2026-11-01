---
title: Glossary
description: Definitions of terms used throughout the Conn3x documentation.
---

## Circuit

A circuit configures a group of hosts, specifying how to connect to them and which steps to run. See [Circuits](https://docs.conn3x.org/reference/circuits/).

## Drift

Drift is a difference between the current state of resources and host steps and the state recorded at the last apply. The `conn3x drift` command reports these differences without changing anything. See [Drift](https://docs.conn3x.org/reference/cli/drift).

## Handler

A handler restarts or reloads a systemd service on hosts where a step that notifies it has made a change. See [Handlers](https://docs.conn3x.org/reference/circuits/handlers).

## Host fact

A host fact is information about a server that Conn3x reads over SSH during planning, such as its operating system, architecture, or memory. See [Host facts](https://docs.conn3x.org/reference/host-facts).

## Revision

A revision is a unique, computed identifier associated with a host-step resource. Conn3x assigns a new revision when an apply changes something on the host and keeps the existing revision when nothing changes. See [Revision and handlers](https://docs.conn3x.org/internals/revision-and-handlers).

## Step

A step applies a module, such as a package, file, or service, to every host in a circuit. Steps run in the order in which they are written. See [Steps](https://docs.conn3x.org/reference/circuits/steps).
