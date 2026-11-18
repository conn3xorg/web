---
title: Find drift
description: See what changed by hand on your servers and in your cloud since the last apply.
---

Someone edits a config file on a server to fix an incident at 3am. Someone resizes a droplet in the console. Each time, what's running stops matching what's written, and nobody notices until the next apply quietly undoes it.

`conn3x drift` tells you first. It reads every resource and every host step again and reports what changed, without changing anything:

```text
$ conn3x drift
Drift found in 2 resources.

Cloud
  ~ digitalocean_droplet.web  changed

Hosts
  ~ conn3x_file.web__page["web1"]  changed

Run conn3x plan to see what Conn3x would change to put them back.
```

A file deleted outside Conn3x shows as `gone`.

## What counts as drift

On hosts, any change to a step counts. In the cloud, a resource counts when a normal `conn3x plan` would change it back, or when it's gone.

Cloud APIs change plenty that nobody set: a BigQuery table's row count after an insert, or a dataset's `etag`. Those aren't drift, so they don't fail your job. The resource is listed instead, and `drift` exits 0:

```text
$ conn3x drift
No drift: the cloud and the hosts match the last apply.

Changed, but your config wouldn't change them back
  google_bigquery_table.events
```

The same goes for a hand change to something your config doesn't set, such as a tag you never declared. That list is the only place you'll see it, so read it if those changes matter to you. To turn one into drift, set the value in your config.

## Run it on a schedule

`drift` exits 0 when nothing drifted, 2 when something did, and 1 on errors, so a scheduled job can alert on it. Run it where your applies run: the same configuration, checked out from Git, the same remote backend and the same credentials. `drift` only reads, but it takes the state lock while it plans, so give it `-lock-timeout` and it waits out an apply instead of failing.

The [web UI](/guides/web-ui) can schedule drift checks for you, and correct what it finds. The rest of this section is for a server or a CI system without it.

### GitHub Actions

```yaml
on:
  schedule:
    - cron: "17 * * * *"
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: conn3xorg/setup-conn3x@v1
        with:
          version: 0.25.0
      - run: conn3x init -input=false
      - name: Check for drift
        run: conn3x drift -no-color -input=false -lock-timeout=5m
```

Give the job your backend and cloud credentials as secrets, as your apply job has them. It fails when drift appears, which is usually the alert you want.

### A systemd timer

On a management host, with the configuration checked out in `/srv/infra` and a `conn3x` user that owns it, two units do it. The service runs one check:

```ini
# /etc/systemd/system/conn3x-drift.service
[Unit]
Description=Conn3x drift check
Wants=network-online.target
After=network-online.target
OnFailure=conn3x-drift-alert.service

[Service]
Type=oneshot
User=conn3x
WorkingDirectory=/srv/infra
# Backend and cloud credentials, as KEY=value lines. Keep it 0600.
EnvironmentFile=/etc/conn3x/drift.env
ExecStartPre=/usr/bin/git pull --ff-only
ExecStartPre=/usr/local/bin/conn3x init -input=false
ExecStart=/usr/local/bin/conn3x drift -no-color -input=false -lock-timeout=5m
```

The timer starts it every hour, at a random point in the first ten minutes, so a fleet of these doesn't hit the backend at once. `Persistent=true` runs a check missed while the host was down:

```ini
# /etc/systemd/system/conn3x-drift.timer
[Unit]
Description=Hourly Conn3x drift check

[Timer]
OnCalendar=hourly
RandomizedDelaySec=10m
Persistent=true

[Install]
WantedBy=timers.target
```

```shell
sudo systemctl daemon-reload
sudo systemctl enable --now conn3x-drift.timer
```

Any exit but 0 marks the service failed, which starts `conn3x-drift-alert.service`. Make that a oneshot that runs your alert script, below. The report is in the journal: `journalctl -u conn3x-drift.service -n 50`.

### cron

Without systemd, a crontab line does the same. `flock` skips a check while the last one is still running:

```text
17 * * * * cd /srv/infra && flock -n /tmp/conn3x-drift.lock conn3x drift -no-color -input=false -lock-timeout=5m > /var/log/conn3x/drift.log 2>&1 || /usr/local/bin/conn3x-drift-alert $?
```

Give cron the backend and cloud credentials the same way your other jobs get them, and keep them out of the crontab.

### Send the alert

An alert script gets the exit code and tells someone. This one posts the report to a chat webhook, such as a Slack or Teams incoming webhook, and treats 1 as a broken check rather than drift:

```shell
#!/bin/sh
# /usr/local/bin/conn3x-drift-alert: $1 is drift's exit code.
# Under systemd, read it from the service instead.
code=${1:-$(systemctl show conn3x-drift.service -p ExecMainStatus --value)}
case $code in
  2) title="Drift found on $(hostname)" ;;
  *) title="The drift check failed on $(hostname) (exit $code)" ;;
esac
report=$(journalctl -u conn3x-drift.service -n 40 -o cat 2>/dev/null || tail -n 40 /var/log/conn3x/drift.log)
jq -n --arg text "$title

$report" '{text: $text}' |
  curl -fsS -X POST -H 'Content-Type: application/json' -d @- "$DRIFT_WEBHOOK_URL"
```

For email instead, pipe the same text to `mail -s "$title" ops@example.com`.

### Machine-readable drift

`drift` has no `-json`. For a dashboard or your own tooling, run the refresh-only plan it's built on:

```shell
conn3x plan -refresh-only -detailed-exitcode -json -input=false -lock-timeout=5m > drift.json
```

Each drifted resource is one line with `"type": "resource_drift"`, so `jq` lists them:

```shell
jq -r 'select(.type == "resource_drift") | "\(.change.action)\t\(.change.resource.addr)"' drift.json
```

```text
update	digitalocean_droplet.web
update	conn3x_file.web__page["web1"]
delete	conn3x_file.web__motd["web2"]
```

Two differences from `drift`. The refresh-only plan doesn't run the second, normal plan `drift` uses to sort the cloud changes your config wouldn't undo, so a table's row count shows here as drift. And `-detailed-exitcode` also exits 2 when only an output changed. If you alert on this, filter the JSON first.

## Then what

- To put things back, run `conn3x plan` to see the exact change, then `conn3x apply`.
- To keep the hand edit, change the circuit to match, then apply. The next `drift` comes back clean.
