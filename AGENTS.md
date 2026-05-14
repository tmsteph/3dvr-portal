# Agent Guidance

- Assume other agents may be working in the same repo or on nearby branches.
- Prefer dedicated worktrees for isolated work instead of sharing one checkout.
- Pull and merge often so your branch stays close to `origin/main` and you do not build on stale context.
- If the change is scoped, tests pass, and you are confident in the result, merge it instead of leaving it hanging.
- Keep PRs narrow and do not overwrite or revert other agents' changes unless the user explicitly asks.

## Push And Merge With Termux GitHub Auth

- GitHub auth for this workspace usually lives in Termux, not `/root`.
- Check auth without printing secrets:
  - `HOME=/data/data/com.termux/files/home /data/data/com.termux/files/usr/bin/gh auth status`
- If `git push` from `/root` fails with `could not read Username`, use the Termux `gh` token through an in-memory Git credential helper:
  ```sh
  GITHUB_TOKEN="$(HOME=/data/data/com.termux/files/home /data/data/com.termux/files/usr/bin/gh auth token)"
  export GITHUB_TOKEN
  git -c credential.helper= \
    -c credential.helper='!f() { echo username=x-access-token; echo password=$GITHUB_TOKEN; }; f' \
    push origin BRANCH_NAME
  unset GITHUB_TOKEN
  ```
- For direct `main` pushes, fetch first and verify the branch is a fast-forward:
  - `git fetch origin --prune`
  - `git rev-list --left-right --count origin/main...HEAD`
  - Push only when the left count is `0`.
- For pull-request repos or protected branches, push the feature branch, create a PR with Termux `gh`, then merge through GitHub:
  - `HOME=/data/data/com.termux/files/home /data/data/com.termux/files/usr/bin/gh pr create --repo OWNER/REPO --base main --head BRANCH_NAME --title "..." --body "..."`
  - `HOME=/data/data/com.termux/files/home /data/data/com.termux/files/usr/bin/gh pr merge PR_NUMBER --repo OWNER/REPO --merge --auto --delete-branch=false`
- If GitHub reports conflicts, do not force-push over the remote branch. Use a temporary worktree, merge `origin/main`, resolve conflicts, run focused tests, push the resolved branch, then merge the PR.
