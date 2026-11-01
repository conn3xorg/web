---
title: Circuit grades
description: How Conn3x grades circuits from A to F, every check and what it's worth, what a grade can't tell you, and how a circuit gets its grade up.
---

Every circuit in the directory has a grade from A to F and a page at `conn3x.org/circuits/<name>/grade` listing each check, its result and the date it was read.

A grade reflects the checks done. It is not a security guarantee, and it doesn't certify anything. A circuit runs as root on your servers, so read it before you run it, whatever its grade.

## How a grade is worked out

A script reads each circuit when the site builds. It looks at the latest `vX.Y.Z` tag and at GitHub's API. It reads no README and takes no one's word for anything, so work that isn't written into CI earns nothing here, even if it was done.

1. Each check that applies to the circuit earns points. A check that can't apply, such as image pinning for a circuit with no images, leaves the total.
2. The score is the points earned as a percentage of the points that apply.
3. The score sets the letter.
4. If a check marked **must pass** fails, the grade is F whatever the score.

| Grade | Score |
|-------|-------|
| A | 90 and up |
| B | 80 to 89 |
| C | 70 to 79 |
| D | 60 to 69 |
| F | below 60, or a failed must-pass check |

**C or better is a pass.** A circuit that doesn't pass stays out of the [Circuit Builder](https://conn3x.org/build) once enforcement is on, with the reason shown. That applies to official and community circuits alike. Enforcement is off for now: every grade is visible, and the builder still offers every circuit it did before.

## The checks

| Check | Group | Points | Must pass | Reads |
|-------|-------|--------|-----------|-------|
| CI is green on main | Testing | 15 | Yes | The latest finished `CI` run from a push to main |
| Applied on real distributions in CI | Testing | 10 | | Distribution names in a job that runs `conn3x apply`. A quarter of the points each, up to four |
| A second plan comes back clean | Testing | 15 | Yes | `conn3x plan -detailed-exitcode` after an apply, not followed by `\|\| true` |
| CI uses the thing, past "service is active" | Testing | 20 | Yes | A command after apply, in the workflow or a script it calls, that does more than look at the host |
| CI checks secrets stay out of state | Testing | 10 | | A CI line that fails on finding a value in state. Applies if a variable is `sensitive` or `ephemeral` |
| Restart or reboot tested | Testing | 5 | | A `restart` or `reboot` after apply. Applies if the circuit runs a service |
| Upgrade tested | Testing | 5 | | A CI step named for an upgrade that runs a second apply |
| Recent run on a real host | Testing | 5 | | A passing run of `.github/workflows/real-host.yml` on main in the last 180 days |
| Downloads are checksummed | Supply chain | 5 | | A `sha256` in every `download` step |
| Container images pinned by digest | Supply chain | 5 | | Image references in the circuit's code |
| Pinned repo keys aren't near expiry | Supply chain | 5 | | Expiry dates in the PGP keys the repo holds. Fails inside 90 days |
| Default listen address | Supply chain | 5 | | Defaults and literals that listen on every address |
| Privileged shell patterns | Supply chain | 10 | | Shell that runs as root |
| Release tag is signed | Repository | 5 | | GitHub's verification of the signature on the latest tag |
| Main is protected | Repository | 5 | | A ruleset on main requiring pull requests and passing checks |
| Released recently | Repository | 5 | | The latest tag is under 180 days old |

## Held checks

Three checks show **Held** on every circuit's page, and they aren't in anyone's score: default listen address, images by digest, and privileged shell patterns. We publish a check's results once the fixes it would point at have shipped. It's held for every circuit, because holding only the failures would give the failures away. When a check is released, scores move.

## What a grade can't see

These checks read files and API responses. They don't run the circuit or review its logic.

- **A pass means CI ran the command, not that the command proves much.** The "uses the thing" check spots commands that only look at a host, such as `systemctl is-active`, `grep` and `kubectl wait`. Anything else counts. A weak test can pass it, and a real test written as a state check can miss it. Each page shows the line it found, so you can judge.
- **Failing to find a test isn't the same as finding a bug.** A circuit with a low grade may work well, and one with an A may not.
- **The checksum check only reads `download` steps.** A fetch made another way isn't seen.
- **Key expiry doesn't check signatures or revocations.** It reads the dates.
- **CI on main can differ from the tag.** The CI file is read at the tag, and the run comes from main.
- **Real-host and upgrade checks are hard to earn today.** No circuit has either yet. That's the honest state of things, so we count them.

If the GitHub API fails during a build, a circuit keeps its last good result. The date on its page is the date the result was read, so an old date means an old reading.

## Raise a grade

Each check says what it wants, so the fix is usually a CI step. These earn the most:

- Add a step after apply that uses what the circuit installed: fetch the page, log in, run a query.
- Add a line that fails if a secret value turns up in `terraform.tfstate`:

  ```yaml
  - name: Check the password stayed out of state
    working-directory: examples/local
    run: "! grep -q example-password terraform.tfstate"
  ```

- Restart the service in CI, then check it again.
- Sign your release tags with `git tag -s`.

## Use the badge

The badge lives at a stable URL. Put this in your README, with your circuit's name:

```markdown
[![Conn3x grade](https://conn3x.org/circuits/<name>/grade.svg)](https://conn3x.org/circuits/<name>/grade)
```
