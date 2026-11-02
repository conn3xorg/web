---
title: Tutorials
description: Hands-on tutorials that take you from a local test host to cloud servers, bastions, secrets, drift checks in CI and a converted Ansible playbook.
---

These tutorials walk you through Conn3x one task at a time. Each page lists what you need, how long it takes, and how to clean up afterwards. They're written for Conn3x v0.6.3, except the Google Cloud and Azure tutorials, which are written for v0.6.12.

Work through them in order if you're new. Each one builds on the ones before it, but you can start anywhere if you already have the prerequisites.

| | Tutorial | Time | You need |
| --- | --- | --- | --- |
| 1 | [Try Conn3x locally](/tutorials/try-locally) | 10 minutes | Podman or Docker |
| 2 | [Configure your first real server](/tutorials/first-server) | 15 minutes | A Linux server you can reach over SSH |
| 3 | [Provision and configure on DigitalOcean](/tutorials/digitalocean) | 15 minutes | A DigitalOcean account. Costs a few cents. |
| 4 | [Provision and configure on Google Cloud](/tutorials/google-cloud) | 15 minutes | A Google Cloud project. Costs a few cents. |
| 5 | [Provision and configure on Azure](/tutorials/azure) | 15 minutes | An Azure subscription. Costs under 20 cents an hour. |
| 6 | [Reach hosts through a bastion](/tutorials/bastion) | 15 minutes | A bastion and a host behind it |
| 7 | [Keep secrets out of state](/tutorials/secrets) | 10 minutes | The container from tutorial 1 |
| 8 | [Catch drift in CI](/tutorials/drift-in-ci) | 15 minutes | A GitHub repository and a remote state backend |
| 9 | [Migrate an Ansible playbook](/tutorials/migrate-ansible) | 15 minutes | A playbook, or the one on the page |
| 10 | [Manage BigQuery and catch changes](/tutorials/bigquery) | 10 minutes | A Google Cloud project. Costs effectively nothing. |

[Get started](/get-started) is a shorter version of tutorials 1 and 2 in one page. The [guides](/guides/provision-and-configure) explain single tasks without the walkthrough, and the [circuit language](/reference/circuits) and [CLI](/reference/cli) reference pages hold every argument and option.
