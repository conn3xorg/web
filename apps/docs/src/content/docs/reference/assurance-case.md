---
title: Assurance case
description: "Why we think Conn3x meets its security requirements: the threats it's built against, where the trust boundaries are, the design principles it follows, and how it counters the common weaknesses in the CWE Top 25."
---

The [security model](/reference/security-model) says what Conn3x trusts and checks. This page argues why that holds: what we defend against, where trust changes hands, and how the code keeps each promise. It's the case a reviewer would test, and we'll correct it when they find a hole.

## What Conn3x has to protect

- **The hosts it manages.** Conn3x runs commands on them, often as root. The worst outcome is someone else's command running there, or a write landing where it shouldn't.
- **The secrets it handles.** SSH keys, sudo passwords, cloud credentials and the values a circuit writes.
- **The integrity of what you install.** A release has to be what the project built from its own source.

## Who we defend against

| Threat | Example |
| --- | --- |
| Someone on the network between you and a host | Intercepting or redirecting the SSH connection |
| An unprivileged user on a managed host | Planting a symlink so root writes somewhere else |
| A value in a configuration or a host fact that isn't what it looks like | A file name or package name with shell syntax in it |
| Someone who can read your state or plan output | Looking for a password a step wrote |
| Someone who tampers with a release or its download | Swapping the binary on the way to you |

Out of scope: someone who controls the machine you run Conn3x on, or who can change the configuration you apply. Either one already has the access Conn3x has. The security model says how to protect both.

## Trust boundaries

1. **Your machine and each host, across SSH.** Every host's identity is checked against a recorded key before any command runs, with no option to skip it, and each jump host on the way is checked the same way.
2. **The login user and root on the host.** Root is reached only through sudo, only with `become`, and a file step works out who can change a path before it writes there as root.
3. **Conn3x and the state.** What a step reads from a host goes into state; write-only arguments and ephemeral values keep secrets out of it.
4. **The project and you, across a release.** Releases are built in CI from `main` and signed there, and you can check the signature and provenance before you run anything.

## How the design follows secure design principles

- **Secure by default.** Host key checks can't be turned off. Old SSH algorithms are off unless one host opts in. The experimental agent is off. State encryption isn't on by default, because OpenTofu's isn't, but every plan warns until you turn it on.
- **Least privilege.** Commands run as the login user unless you set `become`. A root write through a path another user controls drops to that user, or stops.
- **Fail closed.** A changed host key, a path several users can change, or a value a step can't handle stops the run instead of guessing. A network device change that cuts Conn3x off rolls itself back.
- **Complete mediation.** The paths-as-root check runs on every write, walking the path as written, so a link or `..` can't hide where it ends.
- **Economy of mechanism.** Nothing is installed on hosts by default; Conn3x runs plain shell commands it builds itself.
- **Open design.** All of it is open source, and fixed vulnerabilities are published as [security advisories](https://github.com/conn3xorg/conn3x/security/advisories).

## Countering common weaknesses

How Conn3x addresses the CWE Top 25 entries that apply to a tool like it:

| Weakness | How it's countered |
| --- | --- |
| [CWE-78](https://cwe.mitre.org/data/definitions/78.html) OS command injection | Steps quote every configuration value they put into a shell command as a single POSIX word (`ssh.Quote`), and PowerShell scripts receive their arguments as JSON on stdin, decoded as data, never spliced into script text. |
| [CWE-22](https://cwe.mitre.org/data/definitions/22.html) and [CWE-59](https://cwe.mitre.org/data/definitions/59.html) path traversal and link following | The [paths-as-root](/guides/paths-as-root) check: who can change each directory on the way decides who writes, and a path several users can change stops the step. On Windows, folders on the way are held open without following links. |
| [CWE-295](https://cwe.mitre.org/data/definitions/295.html) improper certificate validation, for SSH host keys | Host keys are always verified, for every hop, against known_hosts or a pinned key. |
| [CWE-312](https://cwe.mitre.org/data/definitions/312.html) and [CWE-532](https://cwe.mitre.org/data/definitions/532.html) secrets in storage and logs | Write-only arguments keep values out of state and plans, keeping only an HMAC; sudo and enable passwords are read from files at run time; network device output is masked for secret-bearing lines. |
| [CWE-798](https://cwe.mitre.org/data/definitions/798.html) hard-coded credentials | Conn3x ships none. Keys come from your files or SSH agent. |
| [CWE-787](https://cwe.mitre.org/data/definitions/787.html), [CWE-416](https://cwe.mitre.org/data/definitions/416.html) and other memory errors | Conn3x is written in Go, which is memory safe; the agent's wire format has a fuzz test. |
| [CWE-352](https://cwe.mitre.org/data/definitions/352.html) cross-site request forgery | Not applicable to the CLI. The experimental [web UI](https://github.com/conn3xorg/conn3x-ui) checks a CSRF token on every form. |
| [CWE-494](https://cwe.mitre.org/data/definitions/494.html) download of code without an integrity check | Releases are signed and attested; `download` and `archive` steps take a checksum, and `conn3x lint` flags one without. |

## How we check it

- Unit and end-to-end tests run on every change, the end-to-end ones against real SSH hosts in containers and against Windows Server. Network device steps are tested against lab images before they ship.
- `golangci-lint` and CodeQL run on every pull request.
- Changes to the code that logs in to hosts, runs as root or builds releases need a second maintainer's review, set in CODEOWNERS.
- Vulnerabilities found so far were fixed and published as advisories.

What's not done yet, and on the roadmap: an outside security review, and a coverage target for the code that runs on hosts.
