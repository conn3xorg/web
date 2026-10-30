---
title: Presidio
description: "Presidio's PII analyzer and anonymizer on loopback in Podman, to scrub prompts and documents before a model sees them."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-presidio at v0.1.0. -->

A Conn3x circuit that runs [Presidio](https://github.com/data-privacy-stack/presidio), the open-source PII detection and anonymization service first built at Microsoft, on your own hosts. Send it a prompt or a document before it goes to a model, and you get back where the names, email addresses, phone numbers and card numbers are, or the same text with each one swapped for a placeholder.

Presidio is two small HTTP services. The analyzer finds PII, using spaCy's English model for names and places and patterns and checksums for the rest. The anonymizer takes the analyzer's findings and replaces, masks, hashes or encrypts them. Both run from their official images under Podman as systemd services, pinned by tag and digest, on `127.0.0.1` by default, on Debian, Ubuntu, Fedora or Rocky Linux.

> **Presidio is best-effort detection, not a guarantee.** In its maintainers' words: "because it is using automated detection mechanisms, there is no guarantee that Presidio will find all sensitive information. Consequently, additional systems and protections should be employed." It will miss some names and catch some things that aren't PII. Treat it as one layer, not the reason it's safe to send a document somewhere.

## Usage

```hcl
module "presidio" {
  source = "github.com/conn3xorg/circuit-presidio?ref=v0.1.0"

  hosts                = { gateway = "192.168.1.60" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}
```

Run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

The analyzer answers on `http://127.0.0.1:5002` and the anonymizer on `http://127.0.0.1:5001`, on the host itself. Ask the analyzer what's in a sentence:

```sh
curl -s -H 'Content-Type: application/json' \
  -d '{"text": "My name is David Johnson and my email is david@example.com", "language": "en"}' \
  http://127.0.0.1:5002/analyze
```

It answers with a list of findings: `PERSON` from 11 to 24, `EMAIL_ADDRESS` from 41 to 58, each with a score. Hand those to the anonymizer with the same text:

```sh
curl -s -H 'Content-Type: application/json' \
  -d '{"text": "My name is David Johnson and my email is david@example.com",
       "analyzer_results": [{"entity_type": "PERSON", "start": 11, "end": 24, "score": 0.85},
                            {"entity_type": "EMAIL_ADDRESS", "start": 41, "end": 58, "score": 1.0}]}' \
  http://127.0.0.1:5001/anonymize
```

and the text comes back as `My name is <PERSON> and my email is <EMAIL_ADDRESS>`. The [analyzer](https://presidio.dataprivacystack.org/api-docs/api-docs.html) and anonymizer APIs take more options, such as which entities to look for, a score threshold, and how to replace each kind of finding.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-presidio/tree/v0.1.0/examples/local).

### Your own recognizers

Most organisations have something Presidio has never heard of: project code names, customer IDs, an internal ticket format. You teach the analyzer about them in `analyzer_config`, YAML in Presidio's own [single-file format](https://presidio.dataprivacystack.org/analyzer/analyzer_engine_provider/). A deny-list catches exact words; a pattern catches anything a regular expression can describe:

```hcl
module "presidio" {
  source = "github.com/conn3xorg/circuit-presidio?ref=v0.1.0"

  hosts                = { gateway = "192.168.1.60" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  analyzer_config = <<-YAML
    supported_languages: [en]
    default_score_threshold: 0.4
    recognizer_registry:
      global_regex_flags: 26
      recognizers:
        - name: EmailRecognizer
          type: predefined
        - name: PhoneRecognizer
          type: predefined
        - name: CreditCardRecognizer
          type: predefined
        - name: CodenameRecognizer
          supported_language: en
          supported_entity: PROJECT_CODENAME
          deny_list: [Bluebird, Quillfeather]
        - name: EmployeeIdRecognizer
          supported_language: en
          supported_entity: EMPLOYEE_ID
          patterns:
            - name: employee id
              regex: "\\bEMP-\\d{6}\\b"
              score: 0.9
  YAML
}
```

A `recognizer_registry` section replaces the built-in list rather than adding to it, so name the built-in recognizers you want to keep, as above. The spaCy recognizer, which finds `PERSON`, `LOCATION`, `DATE_TIME` and `NRP`, is added back on its own. To start from the full list, print the one in the image and paste it in:

```sh
podman exec presidio-analyzer cat /app/presidio_analyzer/conf/default_recognizers.yaml
```

The same file can also set `nlp_configuration`. Leave out a section, and the image's default for it is used. The circuit writes the YAML to `/etc/presidio/analyzer.yaml`, mounts it into the analyzer read-only, and restarts the analyzer when it changes. A syntax error is caught at plan time; a setting Presidio rejects makes the apply fail at the health check, with the reason in `journalctl -u presidio-analyzer`.

For a one-off list, you don't need any of this: the analyzer takes [`ad_hoc_recognizers`](https://presidio.dataprivacystack.org/tutorial/09_ad_hoc/) in each request.

### Other languages

The image ships with spaCy's large English model, `en_core_web_lg`, and nothing else. Presidio supports other languages by adding their models, which upstream does by [building its own image](https://presidio.dataprivacystack.org/analyzer/languages/), so this circuit doesn't offer a language switch. The pattern recognizers don't need a model: as Presidio's [own example](https://presidio.dataprivacystack.org/analyzer/recognizer_registry_provider/) shows, you can register one such as `ItFiscalCodeRecognizer` for `en` in `analyzer_config` and find Italian fiscal codes in English text.

### Pairing with LiteLLM

[LiteLLM](https://docs.litellm.ai/docs/proxy/guardrails/pii_masking_v2) has a Presidio guardrail built in. With it, every request that passes through LiteLLM goes to the analyzer first, and the PII it finds is masked, or the request is refused, before anything reaches the model. In LiteLLM's `config.yaml`:

```yaml
guardrails:
  - guardrail_name: presidio-pii
    litellm_params:
      guardrail: presidio
      mode: pre_call
      default_on: true
      presidio_analyzer_api_base: http://127.0.0.1:5002
      presidio_anonymizer_api_base: http://127.0.0.1:5001
      presidio_language: en
      pii_entities_config:
        PERSON: MASK
        EMAIL_ADDRESS: MASK
        PHONE_NUMBER: MASK
        CREDIT_CARD: BLOCK
        US_SSN: BLOCK
```

`mode: pre_call` checks what goes to the model; `post_call` checks the answer as well. `default_on: true` runs it on every request, rather than only those that name the guardrail. Instead of the two `api_base` settings, LiteLLM also reads `PRESIDIO_ANALYZER_API_BASE` and `PRESIDIO_ANONYMIZER_API_BASE` from its environment. Entity names you add with `analyzer_config`, such as `PROJECT_CODENAME`, can go in `pii_entities_config` like the built-in ones.

[circuit-litellm](/circuits/litellm) runs LiteLLM on the host's network, so on the same host it reaches Presidio at `127.0.0.1` and Presidio never has to listen anywhere else. Anything that talks to LiteLLM, including Open WebUI, then gets the same masking. Open WebUI's pipelines also have a [Presidio filter](https://github.com/open-webui/pipelines/blob/main/examples/filters/presidio_filter_pipeline.py), but it runs Presidio as a library inside the pipelines server and doesn't use these services.

### Reaching it from other hosts

Presidio has no authentication. Anyone who can reach its ports can send it text, so the circuit keeps it on `127.0.0.1`. Set `listen_address` to anything that isn't a loopback address and every `conn3x plan` warns you.

When other machines need it, leave Presidio on loopback and put a reverse proxy with authentication in front. With [circuit-caddy](/circuits/caddy), one site can serve both over TLS behind a password:

```hcl
module "caddy" {
  source = "github.com/conn3xorg/circuit-caddy?ref=v0.2.1"

  hosts                = { gateway = "192.168.1.60" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  sites = {
    "presidio.example.com" = {
      # The hash comes from: caddy hash-password
      extra = <<-CADDY
        basic_auth {
          gateway $2a$14$...
        }
        handle_path /analyzer/* {
          reverse_proxy 127.0.0.1:5002
        }
        handle_path /anonymizer/* {
          reverse_proxy 127.0.0.1:5001
        }
      CADDY
    }
  }
}
```

Clients then call `https://presidio.example.com/analyzer/analyze` with the password. LiteLLM's guardrail has no setting for a password of its own, so it's simplest to run LiteLLM on the same host as Presidio and let it use loopback, as above.

## What it does

On each host, in order:

1. When the analyzer runs, creates `/etc/presidio`, mode `0755`. When `analyzer_config` is set, writes it to `/etc/presidio/analyzer.yaml`, mode `0644`, since the analyzer runs as UID 1001 inside its container. Setting `analyzer_config` back to null deletes the file.
2. Through [circuit-podman](/circuits/podman) v0.1.0, installs Podman and runs each service in `services` from `ghcr.io/data-privacy-stack/presidio-analyzer` or `presidio-anonymizer`, by tag and digest, as `presidio-analyzer.service` and `presidio-anonymizer.service`. Both are on the host's network. The image's start script binds `0.0.0.0`, so the unit runs the same gunicorn command with `listen_address` and the service's port instead. The analyzer gets `/etc/presidio` read-only and, with `analyzer_config`, `ANALYZER_CONF_FILE` pointing at it.
3. Waits up to five minutes for each service's `/health` to answer, asking from inside its container, which has Python where the host may have no `curl`. On a first start this includes pulling the images: about 540 MB compressed for the analyzer, which carries the spaCy model, and 50 MB for the anonymizer.

A change to any input restarts the service it touches, which took seconds in testing.

### What it doesn't do

- It doesn't add authentication or TLS. Presidio speaks plain HTTP to anyone who can reach it; see [Reaching it from other hosts](#reaching-it-from-other-hosts).
- It doesn't open a port in a firewall.
- It doesn't install language models beyond the English one in the image.
- It doesn't run more than one gunicorn worker per service. One is upstream's default; each analyzer worker loads its own copy of the spaCy model.
- It doesn't use the image's `-distroless` variants, or Presidio's image redactor or structured-data tools.
- Deleting the module leaves Podman, the containers and `/etc/presidio` in place.

### About the images

Presidio moved from `microsoft/presidio` to the [data-privacy-stack](https://github.com/data-privacy-stack/presidio) organisation on GitHub. Its maintainers now publish images to `ghcr.io/data-privacy-stack`, and say the old `mcr.microsoft.com/presidio-*` images are no longer updated, so this circuit uses the new ones. Both are built for amd64 and arm64.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.60"`, or a host object such as `{ address = "192.168.1.60", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `services` | set(string) | `["analyzer", "anonymizer"]` | Which services to run. The analyzer alone tells you what's in a text; the anonymizer rewrites it from the analyzer's findings. LiteLLM's guardrail wants both. |
| `presidio_version` | string | `"2.2.366"` | Tag of both images. Change both digests with it. |
| `analyzer_digest` | string | `"sha256:036d2f9b..."` | Digest of `presidio-analyzer` for `presidio_version`. Podman pulls by the digest. Find it on the [package page](https://github.com/data-privacy-stack/presidio/pkgs/container/presidio-analyzer) or with `skopeo inspect docker://ghcr.io/data-privacy-stack/presidio-analyzer:TAG`. |
| `anonymizer_digest` | string | `"sha256:b4d9ec90..."` | Digest of `presidio-anonymizer` for `presidio_version`. |
| `listen_address` | string | `"127.0.0.1"` | Address both services listen on. Anything that isn't loopback gets a warning on every plan, since Presidio has no authentication. |
| `analyzer_port` | number | `5002` | Port the analyzer listens on. |
| `anonymizer_port` | number | `5001` | Port the anonymizer listens on. |
| `analyzer_config` | string | `null` | The analyzer's configuration as YAML: `supported_languages`, `default_score_threshold`, and optional `nlp_configuration` and `recognizer_registry` sections. See [Your own recognizers](#your-own-recognizers). When null, the image's defaults: English, with every built-in recognizer. |

## Outputs

| Name | Description |
| --- | --- |
| `services` | The systemd services, by service, such as `{ analyzer = "presidio-analyzer.service" }`. |
| `analyzer_url` | The analyzer's base URL as seen from the host, such as `http://127.0.0.1:5002`. Null when it isn't in `services`. |
| `anonymizer_url` | The anonymizer's base URL as seen from the host. Null when it isn't in `services`. |
| `images` | The images the hosts run, by service, with tag and digest. |

## Requirements

Requires Conn3x v0.6.9 or later and systemd on each host. Each host needs to reach its package mirror and `ghcr.io`. `conn3x init` fetches circuit-podman from GitHub.

The analyzer holds spaCy's large English model in memory: it used about 850 MB in testing, and the anonymizer about 70 MB. Both ran on a 2 GB droplet; give a host that also runs LiteLLM or a model more.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI applies [examples/local](https://github.com/conn3xorg/circuit-presidio/tree/v0.1.0/examples/local) to each on amd64 and checks that the second plan has no changes. It then asks the analyzer about "My name is David Johnson and my email is david@example.com" and expects `PERSON` and `EMAIL_ADDRESS`, hands those to the anonymizer and expects `My name is <PERSON> and my email is <EMAIL_ADDRESS>`, and expects the example's deny-list and pattern to find a made-up code name and an employee ID. It restarts both services and runs the checks again.

The same checks passed by hand on an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, each with 2 GB of memory. From outside, port 5002 didn't answer. After a reboot both services came back on their own, the checks passed again, the second plan was clean, and the Rocky audit log had no denials.

In a local Rocky Linux 10 container, a word added to the deny-list was found after the next apply, and setting `listen_address` to `0.0.0.0` brought the warning on plan and apply.

Upgrading from one `presidio_version` to the next hasn't been tried yet.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-presidio/blob/v0.1.0/LICENSE). Presidio itself is under the MIT license.

## Source

- Repository: [conn3xorg/circuit-presidio](https://github.com/conn3xorg/circuit-presidio). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-presidio/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-presidio/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-presidio/tree/v0.1.0/examples/local).
- Related circuits: [LiteLLM](/circuits/litellm), [Caddy](/circuits/caddy), [Podman](/circuits/podman), [Ollama](/circuits/ollama), [Qdrant](/circuits/qdrant), [Open WebUI](/circuits/openwebui), [Langfuse](/circuits/langfuse), [Agent box](/circuits/agentbox).
