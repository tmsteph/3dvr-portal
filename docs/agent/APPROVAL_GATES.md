# Approval gates

The runner pauses before:

- merging any pull request;
- deploying or redeploying production;
- billing, Stripe, authentication, account security, or credential changes;
- deleting or migrating user data;
- cleaning historical relay data;
- external messages, outreach, purchases, or money movement.

An approval for one pull request never authorizes another. Approval for automatic deployment caused by a merge never authorizes a manual deployment. Approvals expire when the target head SHA changes. GitHub admin bypass is never an automatic action.
