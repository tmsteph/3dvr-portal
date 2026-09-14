# Assembly Access Matrix

The Access Matrix is a read-only explanation of the authorization contract already defined in `assembly/permissions.js`.

It exists because people should be able to understand the effect of a sharing choice before they create a real grant.

## Profiles

| Capability | Owner | Editor | Viewer |
| --- | --- | --- | --- |
| Read workspace | Yes | Yes | Yes |
| Edit workspace | Yes | Yes | No |
| Export workspace | Yes | Yes | Yes |
| Manage access | Yes | No | No |
| Authorize sync | Yes | No | No |

The matrix does not create or mutate grants. It does not read a person's team role and infer permissions.

A team role such as Lead, Steward, Treasurer, Builder, or Organizer remains organizational metadata only.

## Current state

The current browser is still treated as the local Owner for its Assembly workspace. Remote grants and synchronization remain disabled.

The matrix is therefore educational and diagnostic: it makes the future trust model visible without pretending the network layer already exists.
