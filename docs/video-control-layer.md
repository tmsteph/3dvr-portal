# Video Control Layer

## Goal

Turn the portal video tools into a reliable meeting control layer that chooses a safer VDO.Ninja profile, remembers user intent, and gives the user a clean recovery path when the room degrades.

## Phase 1

- Make join role explicit: participant, director, front camera test, back camera test.
- Stop defaulting to `push` for general room links.
- Persist room, role, profile, codec, and safety toggles locally.
- Add a one-click reset to safe defaults.

## Phase 2

- Add explicit network status copy that says why a profile was chosen.
- Track when the user manually overrides the recommended tier.
- Show separate recommendations for mobile sender, mobile viewer, and desktop director.

## Phase 3

- Add a shared control token so a host can issue a downgrade or reset recommendation to guests.
- Carry the control token inside a managed launcher URL so support can send one link instead of hand-configuring each device.
- Back the control channel with Gun when available and fall back to browser channels when it is not.
- Let the launcher reopen the room in a safer tier without making the user rebuild the link.
- Log profile transitions so support can tell whether a failure was network, browser, or user-flow related.

## Phase 4

- Package the control layer into a dedicated shell:
  - Android-first Chromium wrapper if mobile reliability is the main product constraint
  - Desktop Electron launcher if operator-managed desktop calls matter more

Do not package first. The control logic should stabilize in the portal before it is embedded in a wrapper.
