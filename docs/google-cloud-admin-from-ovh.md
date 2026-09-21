# Google Cloud admin access from OVH

## Purpose

Provide a repeatable 3DVR operator path for Google Cloud project administration from the OVH workspace without asking Thomas to operate the slow Google Cloud Console UI.

Initial use case: enable and verify the Gmail API for Google Cloud project number `215834026560`.

## Host

- SSH alias: `3dvr-ovh`
- Current host: `vps-2b6a0420`
- Google Cloud CLI location: `/home/debian/google-cloud-sdk/bin/gcloud`
- Installed with Google's non-interactive Linux installer.

Do not assume the host is authenticated merely because SMTP, Gmail app-password credentials, or Google OAuth credentials for a web application exist. Google Cloud administrative authorization is a separate capability.

## Human authorization flow

For a remote server without a usable signed-in browser:

```bash
/home/debian/google-cloud-sdk/bin/gcloud auth login --no-launch-browser
```

The CLI prints a temporary Google authorization URL. Thomas opens that URL on a trusted browser, signs into the Google account with access to the Cloud project, approves access, and returns the one-time verification code.

Never request, store, or transmit Thomas's Google password.

The temporary authorization URL and verification code are short-lived authentication artifacts and must not be committed to Git, logs, docs, or the portal.

## Configuration

Use a dedicated configuration so Google Cloud administration does not become implicit global state:

```bash
gcloud config configurations create threedvr-admin
gcloud config configurations activate threedvr-admin
gcloud config set project PROJECT_ID
```

Note: gcloud configuration names must begin with a lowercase letter; `3dvr-admin` is invalid, so use `threedvr-admin`.

Project number currently known:

```text
215834026560
```

After authentication, resolve and verify the actual project ID before performing writes:

```bash
gcloud projects describe 215834026560 --format='value(projectId,name,projectNumber)'
```

Do not guess the project ID from a display name such as `tmsteph`.

## Enable Gmail API

After confirming the authenticated principal and project identity:

```bash
gcloud config set project ACTUAL_PROJECT_ID
gcloud services enable gmail.googleapis.com
```

Verify the human-visible/admin result rather than treating command exit status alone as proof:

```bash
gcloud services list --enabled --filter='config.name:gmail.googleapis.com' --format='value(config.name)'
```

Expected result:

```text
gmail.googleapis.com
```

Then perform a 3DVR Campaigns test send and verify:

- connected Gmail identity
- effective sender
- transport used
- expected Sent folder
- rendered subject/body

This follows `docs/human-visible-outcome-verification.md`.

## Security

`gcloud auth login` stores user credentials on the server. Google recommends treating persistent remote user credentials carefully.

For one-time administration, revoke the user credential after the required change if persistent access is unnecessary:

```bash
gcloud auth list
gcloud auth revoke USER_EMAIL
```

For ongoing unattended administration, prefer a dedicated workload identity or service account with the minimum required IAM roles rather than relying indefinitely on a human user's stored login.

Do not reuse:

- Gmail SMTP app passwords
- web-app OAuth refresh tokens
- Campaigns user OAuth tokens

as Google Cloud administrative credentials. They have different purposes and permissions.

## Operational rule

Before claiming a Google Cloud change is complete:

1. identify the exact authenticated account;
2. identify the exact project ID and project number;
3. perform the change;
4. read back the resulting Google Cloud state;
5. verify the downstream user-visible behavior in production.
