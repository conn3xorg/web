---
title: Manage BigQuery and catch changes
description: Create a BigQuery dataset, a table and a read-only service account with one apply, then watch conn3x drift catch a hand edit and ignore new rows.
---

One `conn3x apply` creates a BigQuery dataset, a table with a schema, and a service account that can read that dataset and nothing else. It uses the ordinary `hashicorp/google` provider, so if you've written this for Terraform or OpenTofu, it will look familiar.

The part worth trying comes afterwards. Change the table by hand, and `conn3x drift` tells you.

## What it builds

- A dataset, `conn3x_example`, in the `US` location.
- A table, `events`, with three columns: `happened_at`, `name` and `count`.
- A service account, `conn3x-bq-reader`.
- `roles/bigquery.dataViewer` for that account, granted on the dataset rather than on the project.

The dataset and the table carry the label `conn3x-ci=true`, which you can change with `labels`. Service accounts can't have labels, so this one says `conn3x-ci` in its description.

The reader can read tables in this dataset, but it can't run queries yet. Running a query means creating a job, and that permission (`roles/bigquery.jobUser`) is granted on a project. This example leaves it out so the account stays limited to one dataset. Add it if the account needs to run queries.

## Before you start

- Conn3x v0.6.10 or later.
- A Google Cloud project with the BigQuery and IAM APIs turned on.
- Credentials that can create datasets and service accounts in it, such as `gcloud auth application-default login`. The `bigquery.admin` and `iam.serviceAccountAdmin` roles are enough.
- The `bq` command, part of the Google Cloud CLI, for the steps that change things by hand.

## Cost

Effectively nothing at this size. BigQuery's [list price](https://cloud.google.com/bigquery/pricing) gives you the first 10 GiB of storage and the first 1 TiB of queries free each month, then charges about $0.023 per GiB a month for active storage and $6.25 per TiB queried. A few rows don't come close to either limit. Service accounts and IAM grants are free.

A table you fill with real data costs real money, and it keeps costing until you [remove it](#remove-it).

## Run it

Save this as `main.tf` in an empty directory:

```hcl
terraform {
  required_providers {
    google = { source = "hashicorp/google", version = "~> 7.0" }
  }
}

variable "project" {
  type        = string
  description = "Google Cloud project to create everything in."
}

variable "location" {
  type        = string
  default     = "US"
  description = "Where the dataset's data lives."
}

variable "dataset_id" {
  type        = string
  default     = "conn3x_example"
  description = "Name of the dataset. Letters, numbers and underscores."
}

variable "labels" {
  type        = map(string)
  default     = { conn3x-ci = "true" }
  description = "Labels for the dataset and the table."
}

provider "google" {
  project = var.project
}

resource "google_bigquery_dataset" "example" {
  dataset_id  = var.dataset_id
  location    = var.location
  description = "A small dataset managed by Conn3x."
  labels      = var.labels
}

resource "google_bigquery_table" "events" {
  dataset_id  = google_bigquery_dataset.example.dataset_id
  table_id    = "events"
  description = "Things that happened, one row each."
  labels      = var.labels

  # Without this, conn3x destroy refuses to delete the table. Leave it out
  # for a table you'd miss.
  deletion_protection = false

  schema = jsonencode([
    { name = "happened_at", type = "TIMESTAMP", mode = "REQUIRED", description = "When it happened." },
    { name = "name", type = "STRING", mode = "REQUIRED", description = "What happened." },
    { name = "count", type = "INTEGER", mode = "NULLABLE", description = "How many times." },
  ])
}

# Service accounts can't carry labels, so the description says who owns it.
resource "google_service_account" "reader" {
  account_id   = "conn3x-bq-reader"
  display_name = "BigQuery reader (Conn3x example)"
  description  = "conn3x-ci: reads the ${var.dataset_id} dataset and nothing else."
}

# Granted on the dataset, not the project, so this account can't see any
# other dataset.
resource "google_bigquery_dataset_iam_member" "reader" {
  dataset_id = google_bigquery_dataset.example.dataset_id
  role       = "roles/bigquery.dataViewer"
  member     = google_service_account.reader.member
}

output "table" {
  value = "${var.project}.${google_bigquery_dataset.example.dataset_id}.${google_bigquery_table.events.table_id}"
}

output "reader_email" {
  value = google_service_account.reader.email
}
```

Then:

```sh
conn3x init
conn3x apply -var project=my-project
```

Put your own project in `project`, and type `yes` when asked. It took about 20 seconds when we ran it.

Check it's settled. The plan says `No changes.`, and `conn3x drift` exits 0:

```sh
conn3x plan -var project=my-project
conn3x drift -var project=my-project
```

`drift` lists the table and the dataset as changed even so. BigQuery set some values after the apply, such as the dataset's access list when the grant landed, and your config wouldn't change them back, so they aren't drift:

```text
No drift: the cloud and the hosts match the last apply.

Changed, but your config wouldn't change them back
  google_bigquery_table.events
  google_bigquery_dataset.example
```

Add a few rows and read them back:

```sh
bq --project_id my-project query --use_legacy_sql=false \
  "INSERT INTO conn3x_example.events (happened_at, name, count)
   VALUES (CURRENT_TIMESTAMP(), 'apply', 1), (CURRENT_TIMESTAMP(), 'plan', 2)"

bq --project_id my-project query --use_legacy_sql=false \
  "SELECT name, count FROM conn3x_example.events ORDER BY name"
```

Run `conn3x drift` again. It still exits 0: the row count changed, and nobody's config sets that.

## Catch a change made by hand

Edit the table's description outside the config:

```sh
bq --project_id my-project update --description "Changed by hand" conn3x_example.events
conn3x drift -var project=my-project
```

```text
Drift found in 1 resource.

Cloud
  ~ google_bigquery_table.events  changed

Run conn3x plan to see what Conn3x would change to put them back.

Changed, but your config wouldn't change them back
  google_bigquery_dataset.example
```

It exits 2: 0 means no drift, 2 means drift, and 1 means an error. That makes it easy to [run on a schedule](/guides/drift#run-it-on-a-schedule). `conn3x plan` shows you what changed:

```text
~ description                  = "Changed by hand" -> "Things that happened, one row each."

Plan: 0 to add, 1 to change, 0 to destroy.
```

`conn3x apply` puts the description back and leaves your rows alone.

## Remove it

```sh
conn3x destroy -var project=my-project
```

Type `yes`. This deletes the table and its rows, the dataset, the grant and the service account. The table sets `deletion_protection = false` so that this works. For a table you'd miss, leave that line out.

Then check that it's gone, and delete the state file:

```sh
bq ls --project_id my-project
gcloud iam service-accounts list --project my-project
rm -f terraform.tfstate terraform.tfstate.backup
```

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `project` | string | Required | Google Cloud project to create everything in. |
| `location` | string | `"US"` | Where the dataset's data lives. |
| `dataset_id` | string | `"conn3x_example"` | Name of the dataset. |
| `labels` | map(string) | `{ conn3x-ci = "true" }` | Labels for the dataset and the table. |

## Outputs

| Name | Description |
| --- | --- |
| `table` | The table's full name, `project.dataset.table`. |
| `reader_email` | The reader service account's email address. |

## Tested on

Run with `hashicorp/google` v7.46.2 in the `US` location. The apply created 4 resources in about 20 seconds, and the plan said `No changes.` Rows went in with `INSERT`, and a `SELECT` read them back as the account running the example. A description changed with `bq update` made the plan show that one change, and `conn3x apply` put it back with the rows still there. `conn3x destroy` removed all 4 resources, and `bq ls` and `gcloud iam service-accounts list` showed neither the dataset nor the reader.

With the `drift` change that shipped in v0.6.10, a fresh apply and a row insert each exited 0 with the resources listed, and the hand-changed description exited 2.

We checked the reader's access only through the dataset's access list, which showed it with `READER`. We never logged in as the reader, so its read access, and its lack of access to anything else, are what the grant says rather than something we tried.
