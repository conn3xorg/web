---
title: Run the web UI
description: "Install conn3x-ui on a server, plan and apply from a browser with an approval in between, check and correct drift on a schedule, give a team roles from your OIDC groups, and query the fleet's facts and step results."
---

[conn3x-ui](https://github.com/conn3xorg/conn3x-ui) is a self-hosted web app for running Conn3x as a team. Each project is a Git repository and a path in it. Someone presses **Plan**, someone else reviews what it would change and presses **Apply**, and the apply runs exactly the plan they saw. Every run, its output and who approved it stay in history.

It's experimental, so expect things to change between releases. This page shows the shape of it; the [README](https://github.com/conn3xorg/conn3x-ui#readme) has every flag and setting.

## Before you start

- **A server of its own.** Every run executes a project's circuits on the UI's server, as the UI's user, and that user can read every project's credentials. Anyone who can push to a project's repository can run commands there. Read the [trust model](https://github.com/conn3xorg/conn3x-ui#trust-model) before you give anyone access.
- **A remote state backend** for each project, such as S3, Azure Blob, GCS, `pg` or `http`. The UI keeps no state, and a plan of a configuration with local state fails and says so.
- **TLS in front of it** when people reach it from other machines. The session cookie needs https off localhost.

## Install it

The quickest way onto a Linux server is [circuit-conn3x-ui](/circuits/conn3x-ui). It installs pinned, checksum-verified releases of `conn3x-ui` and `conn3x`, runs the UI as its own user under systemd on `127.0.0.1:8080`, and makes the credentials key on the host, so the key never appears in your plan or state:

```hcl
module "conn3x_ui" {
  source = "github.com/conn3xorg/circuit-conn3x-ui?ref=v0.1.4"

  hosts                = { ops1 = "203.0.113.20" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}
```

Or run the container image, which carries `conn3x`, `git` and an ssh client:

```sh
docker run -d --name conn3x-ui -v ui-data:/data -p 127.0.0.1:8080:8080 \
  ghcr.io/conn3xorg/conn3x-ui:v0.2.0 serve -listen 0.0.0.0:8080 -data /data
```

Either way, the first start creates an `admin` account and prints its password to the log once. Sign in with it, then make accounts for everyone else, or turn on single sign-on.

## Plan and apply

Add a project with its Git URL, branch and path, then press **Plan**. The UI clones the branch, runs `conn3x init` and `conn3x plan`, and shows what would change, host by host and step by step. **Apply** runs that saved plan, not a new one, so what you approved is what happens. If the state changed since, Conn3x refuses the plan and you plan again.

Who may do what is a role per project:

| Role | Can |
| --- | --- |
| viewer | See runs and history |
| planner | Also start plans and drift checks |
| approver | Also apply a plan someone else made |
| admin | Also edit the project, its credentials and its roles |

Site admins are admin on every project. SSH keys, `become` passwords and cloud keys go in each project's **Credentials**, sealed with the UI's key and handed to a run as a file or an environment variable.

## Drift

Give a project a drift check schedule, an interval such as `6h` or five cron fields in UTC, and the UI runs `conn3x plan -refresh-only` on it. A check that finds a host no longer matching the state ends `drift`, and the project's webhook, email addresses, or both hear about it. **Check drift now** runs one straight away.

What a check does about drift is a site admin's choice:

- **Report it**, the default, changes nothing.
- **Correct it** plans, and applies the plan with nobody approving only when every change in it puts back something that drifted.
- **Converge** applies any plan with no delete or replace in it.

Whichever you pick, a plan that deletes or replaces anything, or makes more changes than the project's limit, waits for an approver. A splay starts each check up to a number of minutes late, so projects on the same schedule don't all start at once. More in [Drift](/guides/drift) for how drift works in Conn3x itself.

## Single sign-on and groups

With `-oidc-issuer` and a client, people sign in with your OpenID Connect provider, such as Keycloak or Entra ID. Map your provider's groups to the UI's roles, and joining or leaving a team in one place is enough:

```sh
conn3x-ui serve ... \
  -oidc-admin-group conn3x-admins \
  -oidc-role 'platform=web:approver' \
  -oidc-role 'developers=web:planner'
```

Groups are checked at every sign-in. A role an admin set by hand stays as it is, and the last site admin is never demoted. Once a site admin signs in with OIDC, `-no-password-sign-in` turns passwords off.

## The fleet store

As runs finish, the UI keeps each step's result on each host, and the latest facts each project's `conn3x_host`, `conn3x_packages` and `conn3x_services` data sources read. A read-only API answers across them, for the projects you can view:

```sh
curl -b session=... 'https://conn3x.example.com/api/v1/hosts?fact=os_id:rocky&fact=packages:openssl'
curl -b session=... 'https://conn3x.example.com/api/v1/hosts/db3/changes?since=2026-11-10'
curl -b session=... 'https://conn3x.example.com/api/v1/steps?circuit=hardening&outcome=failed'
```

Step results are kept for 90 days by default, and the latest facts per host for good. Nothing a plan marks sensitive is stored.

## Audit log

Sign-ins, role changes, credential changes, plans, applies and settings changes all go in an append-only audit log, which a site admin can read on its page or download as JSON lines or CSV. No password or credential value is ever in it.
