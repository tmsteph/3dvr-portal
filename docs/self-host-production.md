# OVH Portal production deployment

Every push/merge to main triggers .github/workflows/self-host-production.yml.
Manual dispatch is supported on main only. Vercel is not the production target.

Checkout and deployment use the exact github.sha. A serialized run fetches
origin/main on OVH and skips a superseded queued SHA; the newer main run deploys it.
In-flight releases are never canceled. A host flock also serializes workflow,
control-plane, and manual recovery deployments.

## Ownership and privilege boundaries

/home/debian/.3dvr/self-host-portal-source is a dedicated, disposable deployment
checkout owned by debian. Git clone/fetch/reset/checkout/archive run as that owner.
The control helper uses the same account and source lock, and extracts deployment
code from the requested exact commit instead of executing an older checkout.
The workflow repairs only the checkout's legacy root ownership without relaxing
permissions or granting global safe-directory exceptions. Symlinked checkout roots
are rejected. Root installs immutable releases under
/opt/3dvr-portal-production/releases and manages 3dvr-portal.service.
Secrets remain server-side with mode 600. OVH failure fails the run rather than
silently deploying to DigitalOcean.

## Release transaction

1. Fetch main and verify the full exact SHA. Export its archive into a new release.
2. Start the candidate on loopback port 5320.
3. Check health SHA, Workboard shell, Operator, actual homepage and Needle artifacts,
   and private-file denial.
4. Save the previous release/environment; atomically rename the current symlink.
5. Restart the service and repeat local checks.
6. Verify canonical https://portal.3dvr.tech health SHA and actual root/Needle artifacts.
7. Only then finish the transaction. Earlier exits/signals restore the previous
   symlink/environment and restart the prior backend.
8. GitHub independently compares canonical artifacts with its exact checkout and
   runs Operator acceptance. Its status reflects the entire job outcome.

Deployment no longer writes timestamp-only bridge-pointer commits to main.
Runtime bridge origin changes use the normal reviewed branch/PR flow.
A successful merge is not deployment proof: check Actions and canonical URLs.

## Recovery

Dispatch the normal workflow against main after resolving the recorded failure.
Inspect the failed Actions job and candidate logs in the production state directory.
Never manually repoint current, deploy a dirty service checkout, or use a Vercel
deployment as evidence of canonical production.
Model/WASM loading is a separate browser acceptance check: failure of externally
hosted assets does not mean the Portal HTTP release itself is unhealthy.

After canonical validation, retain the six newest immutable SHA releases plus
current and previous releases. State, secrets, non-SHA directories, and symlinks
are excluded from pruning. Old commits can be rebuilt through the same pipeline.

## Browser acceptance

The Actions Ubuntu runner's existing Chrome is used through
PORTAL_E2E_EXECUTABLE_PATH; browser setup is bounded to three minutes.
Do not run an unbounded apt/browser dependency reinstall for every main merge.

Needle's browser assets are pinned together to upstream commit
2ae11323dc000f5e70c49f7403efa6af12ba9e67. Needle 3 text completion is
needle_complete(input, 0, 0, max_new_tokens, output, output_capacity);
the old four-argument API loads the model but fails inference.
The upstream wasm/needle.h header is the ABI authority.
\nThe navigation router resets turn history and reserves 128 generation tokens\nso schemas and output fit its small context. WASM buffers are freed on errors too.\n\nDecode the null-terminated output buffer with UTF8ToString. The completion\nreturn value is not the JSON byte length; slicing at it truncates valid JSON.\n