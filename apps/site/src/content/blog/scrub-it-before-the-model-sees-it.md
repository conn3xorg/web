---
title: "Scrub it before the model sees it"
description: "Someone is about to paste a customer's name, email and card number into a prompt. circuit-presidio runs Presidio on your own host to find that data and swap it for placeholders first. It's best effort, and this post is honest about what that means."
date: 2026-12-02
author: James Conway
image: /media/blog/scrub-it-before-the-model-sees-it/card.png
imageAlt: "Scrub it before the model sees it. The text 'My name is David Johnson' and an email address go through Presidio, which finds PERSON and EMAIL_ADDRESS, and come out as 'My name is <PERSON>' and '<EMAIL_ADDRESS>'."
series: "AI you can account for"
---

Here's a support ticket someone wants summarised: "Customer David Johnson, david@example.com, says card ending 4242 was charged twice." Three pieces of personal data in one sentence, and the model needs none of them to write a decent summary.

People paste first and think later. That's not a training problem you'll ever finish solving. What you can do is put something between the paste and the model that looks for the obvious stuff and swaps it out. [Presidio](https://github.com/data-privacy-stack/presidio), the open-source PII detector first built at Microsoft, does that, and [circuit-presidio](https://github.com/conn3xorg/circuit-presidio) runs it on your own host.

It's the fourth post in our series on [AI you can account for](/blog/ai-you-can-account-for), and the one with the biggest caveat. So let's start with it.

## Best effort, in its maintainers' own words

> …because it is using automated detection mechanisms, there is no guarantee that Presidio will find all sensitive information. Consequently, additional systems and protections should be employed.

That's from Presidio's maintainers, not from us. It will miss some names, particularly unusual ones, and it'll flag some things that aren't personal data at all. So treat it as one layer. It's the reason fewer customer emails reach a model. It isn't the reason it's safe to send a document somewhere.

A layer is still worth having. It just has to be one of the things standing between a customer's details and a model, never the only one.

<figure>
  <a href="/media/blog/scrub-it-before-the-model-sees-it/scrub.png">
    <img src="/media/blog/scrub-it-before-the-model-sees-it/scrub.png" width="1600" height="1688" loading="lazy" decoding="async" alt="Scrub it before the model sees it. Step 1, the prompt: My name is David Johnson and my email is david@example.com. Step 2, the analyzer on 127.0.0.1:5002 finds PERSON from 11 to 24 and EMAIL_ADDRESS from 41 to 58. Step 3, the anonymizer on 127.0.0.1:5001 returns My name is <PERSON> and my email is <EMAIL_ADDRESS>. Custom recognizers add a deny list and a pattern. Running it on every LiteLLM request is marked coming. A warning quotes Presidio's maintainers: there is no guarantee it will find all sensitive information." />
  </a>
  <figcaption>The same sentence CI checks on all four distributions.</figcaption>
</figure>

<details>
<summary>Read the diagram as text</summary>

1. **The prompt someone wrote:** "My name is David Johnson and my email is david@example.com".
2. **The analyzer**, on `127.0.0.1:5002` at `/analyze`, finds `PERSON` from 11 to 24 and `EMAIL_ADDRESS` from 41 to 58, each with a score.
3. **The anonymizer**, on `127.0.0.1:5001` at `/anonymize`, returns "My name is `<PERSON>` and my email is `<EMAIL_ADDRESS>`".

- **Your own words:** a deny list in `analyzer_config` finds exact words, such as the code names `Bluebird` and `Quillfeather`, as `PROJECT_CODENAME`.
- **Your own formats:** a pattern finds anything a regular expression can describe, such as `\bEMP-\d{6}\b`, as `EMPLOYEE_ID`.
- **Out of the box:** English, with spaCy's large model for names and places, and patterns and checksums for emails, phone numbers and cards.
- **Coming:** running it on every request through LiteLLM, which needs an input circuit-litellm doesn't have yet.
- **Best effort:** in its maintainers' words, "there is no guarantee that Presidio will find all sensitive information".

</details>

## Two services, on loopback

Presidio is two small HTTP services. The analyzer finds personal data, using spaCy's English model for names and places, and patterns and checksums for the rest. The anonymizer takes what the analyzer found and replaces it, masks it, hashes it or encrypts it. The circuit runs both from their official images, pinned by tag and digest, under Podman as systemd services, on `127.0.0.1`.

The whole configuration is this:

```hcl
module "presidio" {
  source = "github.com/conn3xorg/circuit-presidio?ref=v0.1.0"

  hosts                = { gateway = "192.168.1.60" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}
```

Run `conn3x init` and `conn3x apply`, and it's up. The first apply pulls about 540 MB for the analyzer, which carries the language model, and 50 MB for the anonymizer.

## Try it

On the host, ask the analyzer what's in a sentence:

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

And back it comes: `My name is <PERSON> and my email is <EMAIL_ADDRESS>`. A model can still summarise that. It just can't repeat it.

## Teach it your own words

Presidio knows what an email address looks like. It's never heard of your project code names, your customer IDs or the format of your internal tickets. You teach it in `analyzer_config`, in Presidio's own YAML. A deny list catches exact words; a pattern catches anything a regular expression can describe:

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

One thing catches people out. A `recognizer_registry` section replaces the built-in list rather than adding to it, which is why the example names the email, phone and card recognizers it wants to keep. The spaCy recognizer for names, places and dates comes back on its own. A YAML syntax error fails the plan, before anything touches the host.

## Where it belongs

Calling Presidio by hand is fine for a script. Where it really earns its keep is in the path every prompt already takes, and in this series that's the [LiteLLM gateway](/blog/one-gateway-for-every-model). LiteLLM has a Presidio guardrail built in: every request goes to the analyzer first, and what it finds is masked, or the request refused, before anything reaches the model. Anything that talks to LiteLLM, Open WebUI included, would get the same masking.

We'd like to tell you that's one apply away. It isn't yet. circuit-litellm v0.1.0 writes LiteLLM's `config.yaml` itself and has no input for the guardrails section, so the pairing the Presidio README describes needs a new release of circuit-litellm first. We haven't tested the two together, and we won't call it done until we have.

## What we tested

CI applies the example to Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13 and checks the second plan has no changes. Then it runs the two commands above and expects exactly that output, and checks that the deny list and the pattern find a made-up code name and an employee ID. It restarts both services and runs the checks again.

By hand, on an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, each with 2 GB of memory, port 5002 didn't answer from outside, and after a reboot both services came back and the checks passed. The analyzer used about 850 MB of memory, most of it the language model; the anonymizer about 70 MB.

## What it doesn't do

- **It doesn't guarantee anything.** See the top of this post. Then read it again before you write a policy that leans on it.
- **No authentication.** Anyone who can reach Presidio's ports can send it text, so it stays on loopback, and every plan warns you if you set `listen_address` to anything else. For other hosts, put [circuit-caddy](https://github.com/conn3xorg/circuit-caddy) in front with a password; the README has the config.
- **English only.** The image ships spaCy's English model and no other. Pattern recognizers don't need a model, so you can find Italian fiscal codes in English text. Names in German text need a German model, and this image doesn't have one.
- **No guardrail wiring yet.** As above: the LiteLLM pairing needs circuit-litellm to grow an input first.
- **Upgrades are untested.** Moving from one `presidio_version` to the next hasn't been tried yet.

## Try it

The [README](https://github.com/conn3xorg/circuit-presidio) has every input, and [examples/local](https://github.com/conn3xorg/circuit-presidio/tree/main/examples/local) runs it on a throwaway container. Next week: a box of its own for your coding agents.
