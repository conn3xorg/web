---
title: Try Conn3x locally
description: Configure a throwaway Rocky Linux container with Conn3x, change it by hand, and watch plan and drift catch the change.
---

In this tutorial you'll configure a Rocky Linux 10 container running on your own machine. You'll apply a circuit, edit a file on the host by hand, and see how `conn3x plan` and `conn3x drift` report the change. You don't need a server or a cloud account.

**Time:** 10 minutes.

## Prerequisites

- Conn3x v0.6.2 [installed](/install).
- [Podman](https://podman.io/docs/installation) or [Docker](https://docs.docker.com/get-docker/), running.
- `git`, `ssh` and `ssh-keyscan`, which come with macOS and most Linux distributions.
- Port 2222 free on `127.0.0.1`.

## Get the example

The example lives in the Conn3x repository. Clone the v0.6.2 release and change into the example's directory:

```sh
git clone --depth 1 --branch v0.6.2 https://github.com/conn3xorg/conn3x
cd conn3x/examples/try-it-locally
```

The directory holds a `Containerfile` for the test host, two scripts that start and remove it, and one circuit, `main.circuit.hcl`:

```hcl
circuit "try" {
  hosts = { box = "127.0.0.1" }

  ssh {
    port             = 2222
    user             = "root"
    private_key_file = "./id_ed25519"
    known_hosts_file = "./known_hosts"
  }

  step "tools" {
    package {
      name = "tree"
    }
  }

  step "deploy_user" {
    user {
      name  = "deploy"
      shell = "/bin/bash"
    }
  }

  step "motd" {
    file {
      path    = "/etc/motd"
      content = "Hello from ${each.key}, set up by Conn3x.\n"
    }
  }
}
```

The circuit `try` configures one host, named `box`, at `127.0.0.1`. The `ssh` block says how to log in to it. It has three steps, which run in order: install the `tree` package, create a `deploy` user, and write `/etc/motd`. `${each.key}` is the host's name, `box`.

## Start the host

```sh
./up.sh
```

```text
Ready: a Rocky Linux 10 host on 127.0.0.1:2222. Now run: conn3x init && conn3x plan
```

The script builds a small image that runs `sshd`, starts it as the container `conn3x-try` on `127.0.0.1:2222`, creates an SSH key pair in `id_ed25519`, and records the container's host key in `known_hosts`. Conn3x checks host keys on every connection, so the circuit points `known_hosts_file` at that file. `up.sh` uses Podman if it's installed, and Docker otherwise. Set `ENGINE=docker` to choose Docker.

## Initialize the directory

```sh
conn3x init
```

```text
Initializing the backend...

Initializing provider plugins...
- terraform.io/builtin/conn3x is built in to Conn3x

Conn3x has been successfully initialized!
```

The `conn3x` provider is built into the binary, so there's nothing to download. `init` also warns that state isn't encrypted. That's fine for a test host. See [conn3x init](/reference/cli/init) for what the warning means.

## Plan

```sh
conn3x plan
```

The plan lists each step as a resource, one instance per host. Here is the `motd` step, followed by the summary:

```text
  # conn3x_file.try__motd["box"] will be created
  + resource "conn3x_file" "try__motd" {
      + content    = <<-EOT
            Hello from box, set up by Conn3x.
        EOT
      + content_wo = (write-only attribute)
      + id         = "127.0.0.1:2222:/etc/motd"
      + mode       = "0644"
      + on_remove  = "forget"
      + path       = "/etc/motd"
      + revision   = (known after apply)
      + sha256     = "06b6c9ebb3b33eb4f680ad4137d2e87d7e45b1cb116381b90b085d6ec0beb65d"

      + ssh {
          + host             = "127.0.0.1"
          + known_hosts_file = "./known_hosts"
          + port             = 2222
          + private_key_file = "./id_ed25519"
          + user             = "root"
        }
    }

  # conn3x_package.try__tools["box"] will be created
  # conn3x_user.try__deploy_user["box"] will be created

Plan: 3 to add, 0 to change, 0 to destroy.
```

`step "motd"` in circuit `try` became the resource `conn3x_file.try__motd`, and `["box"]` is the host. [Resource addresses](/reference/circuits/addresses) explains the naming.

## Apply

```sh
conn3x apply
```

Conn3x shows the plan again and asks for confirmation. Type `yes`:

```text
Plan: 3 to add, 0 to change, 0 to destroy.

Do you want to perform these actions?
  Conn3x will perform the actions described above.
  Only 'yes' will be accepted to approve.

  Enter a value: yes

conn3x_package.try__tools["box"]: Creating...
conn3x_package.try__tools["box"]: Creation complete after 5s [id=127.0.0.1:2222:package:tree]
conn3x_user.try__deploy_user["box"]: Creating...
conn3x_user.try__deploy_user["box"]: Creation complete after 3s [id=127.0.0.1:2222:user:deploy]
conn3x_file.try__motd["box"]: Creating...
conn3x_file.try__motd["box"]: Creation complete after 1s [id=127.0.0.1:2222:/etc/motd]

Apply complete! Resources: 3 added, 0 changed, 0 destroyed.
```

The steps ran in the order they're written. Now plan again:

```sh
conn3x plan
```

```text
conn3x_package.try__tools["box"]: Refreshing state... [id=127.0.0.1:2222:package:tree]
conn3x_user.try__deploy_user["box"]: Refreshing state... [id=127.0.0.1:2222:user:deploy]
conn3x_file.try__motd["box"]: Refreshing state... [id=127.0.0.1:2222:/etc/motd]

No changes. Your infrastructure matches the configuration.
```

Each `Refreshing state...` line is Conn3x logging in to the host and reading that step back: whether the package is installed, whether the user exists, what the file contains. The host matches the circuit, so there's nothing to do.

## Change something by hand

Log in to the container and overwrite `/etc/motd`, the way someone might during an incident:

```sh
ssh -p 2222 -i id_ed25519 -o UserKnownHostsFile=known_hosts root@127.0.0.1 'echo edited > /etc/motd'
```

Run `conn3x plan`:

```sh
conn3x plan
```

```text
  # conn3x_file.try__motd["box"] will be updated in-place
  ~ resource "conn3x_file" "try__motd" {
      ~ content    = <<-EOT
          - edited
          + Hello from box, set up by Conn3x.
        EOT
      ~ content_wo = (write-only attribute)
        id         = "127.0.0.1:2222:/etc/motd"
      ~ revision   = "2fe4bc255d3ad40a" -> (known after apply)
      ~ sha256     = "68f01b289aedcf28e96fce1f9444365e83b9bfc7e1bf32df20f1f15966835316" -> "06b6c9ebb3b33eb4f680ad4137d2e87d7e45b1cb116381b90b085d6ec0beb65d"
        # (3 unchanged attributes hidden)

        # (1 unchanged block hidden)
    }

Plan: 0 to add, 1 to change, 0 to destroy.
```

The plan read the file from the host and shows the line-by-line difference: what's there now, and what the circuit says it should be.

## Check for drift

`conn3x plan` tells you what it would change. `conn3x drift` answers a narrower question, what changed since the last apply, and changes nothing:

```sh
conn3x drift
```

```text
Drift found in 1 resource.

Hosts
  ~ conn3x_file.try__motd["box"]  changed

Run conn3x plan to see what Conn3x would change to put them back.
```

`drift` exits with code `2` when it finds drift, `0` when it doesn't, and `1` on an error. A scheduled job can use the exit code to raise an alert. [Catch drift in CI](/tutorials/drift-in-ci) sets one up.

## Put it back

```sh
conn3x apply
```

Type `yes`. The apply writes the file back:

```text
conn3x_file.try__motd["box"]: Modifying... [id=127.0.0.1:2222:/etc/motd]
conn3x_file.try__motd["box"]: Modifications complete after 1s [id=127.0.0.1:2222:/etc/motd]

Apply complete! Resources: 0 added, 1 changed, 0 destroyed.
```

Run `drift` again to confirm the host matches:

```sh
conn3x drift
```

```text
No drift: the cloud and the hosts match the last apply.
```

To keep a hand edit instead, change the circuit to match it and apply. The next `drift` comes back clean either way.

## Clean up

If you're going on to [Keep secrets out of state](/tutorials/secrets), leave the container running. It uses the same host.

Otherwise, remove the container and everything the tutorial created:

```sh
./down.sh
```

```text
Removed.
```

`down.sh` removes the `conn3x-try` container, the SSH key, `known_hosts`, the state files and the `.terraform` directory. It leaves the `conn3x-try` image, which you can remove with `podman rmi conn3x-try` or `docker rmi conn3x-try`.

## Next steps

- [Configure your first real server](/tutorials/first-server), with sudo, a service and a handler.
- Read [Concepts](/concepts) for how circuits, plans, state and drift fit together.
- See the [conn3x drift](/reference/cli/drift) reference for its options.
