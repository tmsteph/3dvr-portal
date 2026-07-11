# Career and Opportunity Onboarding

This document covers the career-oriented onboarding path in the 3DVR Portal, its current deterministic generation
model, and the safe path toward optional local or hosted language-model assistance.

## Product Purpose

The central idea is:

> Startup skills are opportunity-creation skills.

The experience does not require someone to identify as an entrepreneur. It helps people notice problems, create a
small useful result, gather evidence, communicate their value, and move toward employment, career growth, freelance
work, community contribution, or a startup.

The four entry paths are:

- **I feel stuck** -> Daily Direction
- **I need a career** -> Career Launch
- **I want to grow in my current career** -> Opportunity Builder
- **I want to start something** -> Launch Room

## Public Routes

- `https://portal.3dvr.tech/career-launch/`
- `https://portal.3dvr.tech/opportunity-builder/`
- `https://portal.3dvr.tech/start/`
- `https://portal.3dvr.tech/launch-room/`

## Current Architecture

The first implementation is intentionally browser-first and provider-independent.

| Area | Files | Responsibility |
| --- | --- | --- |
| Shared configuration | `career-pathways/pathway-config.js` | Questions, route metadata, storage keys, and tool links |
| Brief generation | `career-pathways/brief-generator.js` | Deterministic Career Launch and Opportunity Brief output |
| Persistence boundary | `career-pathways/pathway-storage.js` | Defensive browser storage reads, writes, and reset |
| Shared controller | `career-pathways/app.js` | Step navigation, validation, rendering, copy, and print |
| Shared presentation | `career-pathways/styles.css` | Mobile-first and printable layout |
| Launch Room modes | `launch-room/modes.js` | Mode-specific language and brief adaptation |

The browser stores one JSON object per pathway:

```text
3dvr.career-launch.progress.v1
3dvr.opportunity-builder.progress.v1
```

Each object contains the selected mode, current step, answers, and optional generated brief. Reset removes only the
current pathway key. The current version does not send answers to 3DVR, OpenAI, Hugging Face, or a DigitalOcean host.

## Brief Guarantees

The deterministic generator is the source of truth and the fallback for every future provider.

- It can generate a brief without a network connection.
- Career output includes a real person or organization, a tiny proof project, evidence, resume language, immediate
  income direction, longer-term direction, and three actions.
- Workplace output includes a stakeholder conversation, permission checks, privacy constraints, evidence, and three
  actions.
- It does not promise employment, promotion, income, or business success.
- It does not tell users to access private data or modify workplace systems without authorization.

## Model Provider Direction

Model assistance should improve specificity and wording. It must not become required for completing either flow.

A future provider adapter should accept:

```js
{
  mode,
  answers,
  deterministicBrief
}
```

It should return the same section structure as the deterministic brief. The server must reject malformed output and
return `deterministicBrief` when the provider is unavailable, times out, exceeds budget, or violates safety rules.

Provider order for a hybrid pilot:

1. Deterministic browser generator, always available.
2. Opt-in local model on a trusted device or private server.
3. Opt-in hosted API for harder synthesis.

Do not silently send pathway answers to a model. Show the provider, explain what leaves the device, and require an
explicit generation action.

## Local Model Pilot

The current `debian-web` DigitalOcean machine has about 4 GB of RAM and no dedicated GPU. A realistic first model test
is therefore a small quantized instruct model, roughly 1B-3B parameters, served by a CPU runtime such as `llama.cpp`.

Keep the model service private:

- bind it to `127.0.0.1`
- place an authenticated server adapter in front of it before any public use
- cap input length, output length, concurrency, and request duration
- do not log raw answers by default
- preserve the deterministic fallback

Benchmark before choosing a model. Record schema-valid output rate, median and worst-case latency, peak memory,
usefulness, unsafe advice, and whether it invents qualifications or outcomes.

## OpenAI Hosted Pilot

A ChatGPT subscription and the OpenAI API are separate products with separate billing. A ChatGPT login or subscription
cannot be used as a server credential. Automated portal generation requires an API project, API billing, and a
server-side `OPENAI_API_KEY`.

Official references:

- [ChatGPT and API billing are separate](https://help.openai.com/en/articles/8156019-i-want-to-move-my-chatgpt-subscription-to-the-api)
- [OpenAI API quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request)
- [API authentication and key safety](https://platform.openai.com/docs/api-reference/authentication)

For manual research, a team member can paste a synthetic or consented example into ChatGPT and compare its answer with
the deterministic brief. Do not paste another person's private career, health, workplace, or financial information.

For an automated pilot:

1. Create an API project and a restricted project key.
2. Set a small prepaid budget or usage limit.
3. Store `OPENAI_API_KEY` only in the server environment or secret manager.
4. Never expose the key in portal JavaScript, browser storage, Gun, logs, or Git.
5. Add an explicit hosted-generation button and provider disclosure.
6. Validate model output against the shared brief structure and fall back deterministically.

## DigitalOcean Static Pilot

The first server deployment proves that the merged browser experience can run independently on a 3DVR machine. It
does not add model inference yet.

Service properties:

- unit: `career-pilot.service`
- checkout: `/opt/3dvr/worktrees/career-pilot`
- address: `127.0.0.1:4174`
- user: `www-data`
- public exposure: none
- secrets: none

Open it through an SSH tunnel:

```bash
ssh -L 4174:127.0.0.1:4174 debian-web
```

Then visit:

```text
http://127.0.0.1:4174/career-launch/
http://127.0.0.1:4174/opportunity-builder/
```

Deploy or refresh:

```bash
ssh debian-web
cd /opt/3dvr/worktrees/career-pilot
git fetch origin main
git checkout main
git merge --ff-only origin/main
systemctl restart career-pilot.service
systemctl status career-pilot.service --no-pager
```

This workflow is intentionally limited to the disposable clean pilot clone. Never update the dirty canonical checkout
at `/opt/3dvr/3dvr-portal` as part of this pilot.

Smoke test from the server:

```bash
curl --fail http://127.0.0.1:4174/career-launch/ | grep 'Career Launch'
curl --fail http://127.0.0.1:4174/opportunity-builder/ | grep 'Opportunity Builder'
curl --fail http://127.0.0.1:4174/career-pathways/brief-generator.js | grep 'generatePathwayBrief'
```

Rollback:

```bash
cd /opt/3dvr/worktrees/career-pilot
git log --oneline -5
git checkout --detach PREVIOUS_KNOWN_GOOD_COMMIT
systemctl restart career-pilot.service
```

Remove the pilot:

```bash
systemctl disable --now career-pilot.service
rm /etc/systemd/system/career-pilot.service
systemctl daemon-reload
```

## Pilot Evaluation

Run at least five consented sessions before adding AI to the public flow. Capture only the minimum useful evaluation
data:

- pathway selected
- completion or abandonment step
- whether the suggested real-world project was feasible
- whether the evidence suggestion was useful
- whether the user took one action within seven days
- optional user-edited brief, with explicit consent

The next implementation decision should be based on observed failures. Add model assistance only where deterministic
output is repeatedly too generic, and keep all safety and fallback behavior outside the model.
