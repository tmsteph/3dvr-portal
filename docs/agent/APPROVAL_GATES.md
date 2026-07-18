# Approval Gates

These gates are mandatory even when a mission is run unattended:

- merge a pull request;
- deploy to production or promote a production alias;
- change billing, Stripe, authentication, or account security;
- access, print, or expose secrets;
- delete or migrate user data;
- clean historical relay data;
- send email, outreach, social posts, or other external communications.

The mission runner may prepare evidence and a draft PR, but it must set the mission to `waiting_for_approval` at these boundaries. Approval is a human action recorded outside the runner and then reflected in the mission state.
