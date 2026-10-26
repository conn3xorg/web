---
title: Catch drift in CI
description: Run conn3x drift on a schedule in GitHub Actions, so a hand edit on a server or in the cloud fails a job instead of waiting for the next apply.
---

In this tutorial you'll add a GitHub Actions workflow that runs `conn3x drift` every hour. When someone changes a server or a cloud resource by hand, the job fails and GitHub notifies you. `drift` only reads: it changes nothing on your hosts, in your cloud or in state.

**Time:** 15 minutes.

## Prerequisites

- A Conn3x configuration in a GitHub repository, applied at least once. Any configuration from the earlier tutorials works, except the local container from tutorial 1, which GitHub's runners can't reach.
- State in a [remote backend](https://opentofu.org/docs/language/settings/backends/configuration/) that the job can read, such as S3 or Postgres. A `terraform.tfstate` on your laptop isn't visible to CI.
- Hosts that GitHub-hosted runners can reach over SSH. For private hosts, use a [self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners) on their network, or a [bastion](/tutorials/bastion).
- A private key the runner can log in with. This tutorial assumes the circuit's `private_key_file` is `~/.ssh/id_ed25519` and that host keys are checked against `~/.ssh/known_hosts`, the default.

## Add the secrets

In the repository, open **Settings > Secrets and variables > Actions** and add:

| Secret | Value |
| --- | --- |
| `SSH_PRIVATE_KEY` | The private key the circuit logs in with. |
| `SSH_KNOWN_HOSTS` | The `known_hosts` lines for every host and jump host. Copy them from your own `~/.ssh/known_hosts`, or collect them with `ssh-keyscan` and check the fingerprints. |
| `CONN3X_HMAC_KEY` | The content of `~/.config/conn3x/hmac.key` from the machine that applied. Only needed if state holds [write-only content](/tutorials/secrets). |

Add your backend's credentials as secrets too, and a secret for each variable without a default, passed as `TF_VAR_<name>`. `drift` never prompts, so a missing variable is an error.

## Add the workflow

Create `.github/workflows/drift.yml`:

```yaml
name: Drift

on:
  schedule:
    - cron: "17 * * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  drift:
    runs-on: ubuntu-24.04
    env:
      CONN3X_HMAC_KEY: ${{ secrets.CONN3X_HMAC_KEY }}
      TF_IN_AUTOMATION: "1"
      # Your backend's credentials and any TF_VAR_ values go here too.
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false

      - name: Install Conn3x
        env:
          VERSION: 0.5.0
        run: |
          curl -fsSL "https://github.com/conn3xorg/conn3x/releases/download/v${VERSION}/conn3x_${VERSION}_linux_amd64.tar.gz" | tar -xz conn3x
          sudo install conn3x /usr/local/bin/
          conn3x version

      - name: Set up SSH
        env:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          SSH_KNOWN_HOSTS: ${{ secrets.SSH_KNOWN_HOSTS }}
        run: |
          install -d -m 700 ~/.ssh
          printf '%s\n' "$SSH_PRIVATE_KEY" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          printf '%s\n' "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts

      - run: conn3x init -input=false

      - name: Check for drift
        run: conn3x drift -no-color
```

The workflow runs at 17 minutes past every hour, and on demand from the **Actions** tab through `workflow_dispatch`. If your configuration isn't at the root of the repository, add `working-directory` to the last two steps rather than using `-chdir`: in v0.5.0, `drift` with a relative `-chdir` fails. See the [drift reference](/reference/cli/drift#limitations-in-v050).

Each step that runs `conn3x` gets the HMAC key from the job's `env`. Without it, Conn3x would make a new key on the runner, and stop at the first write-only file.

## What the job reports

`conn3x drift` exits `0` when nothing changed, `2` when something drifted, and `1` on an error, so both drift and errors fail the job. The log shows which resources changed:

```text
Drift found in 1 resource.

Hosts
  ~ conn3x_file.try__motd["box"]  changed

Run conn3x plan to see what Conn3x would change to put them back.
```

When nothing changed:

```text
No drift: the cloud and the hosts match the last apply.
```

`drift` reports which objects changed, not how. Run `conn3x plan` on your own machine to see the diff, then either `conn3x apply` to put things back, or change the configuration to keep the hand edit. The next scheduled run comes back clean.

Run the workflow once by hand from the **Actions** tab to check the secrets before you rely on the schedule.

## Clean up

To stop the checks, delete `.github/workflows/drift.yml`, or disable the workflow from the **Actions** tab. Delete the secrets from **Settings > Secrets and variables > Actions** if nothing else uses them.

## Next steps

- [Find drift](/guides/drift) covers what to do when drift appears.
- The [conn3x drift](/reference/cli/drift) reference lists its options, such as `-target` to check part of a configuration.
- [Migrate an Ansible playbook](/tutorials/migrate-ansible).
