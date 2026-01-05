# Supabase test sandbox

This folder is a small, dedicated space for Supabase-focused tests without touching GunJS flows.
It keeps Supabase connectivity experiments isolated from existing test suites.

## Setup

1. Create a Supabase project (or reuse an existing one).
2. Export the connection details before running tests:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your_anon_key"
```

## Running

```bash
node --test tests/supabase
```

## Browser access

Open `tests/supabase/index.html` from the portal home page to use the Supabase Test Lab UI.

## Notes

- Tests in this folder are designed to skip automatically when credentials are missing.
- Add new tests here as we expand Supabase coverage.
