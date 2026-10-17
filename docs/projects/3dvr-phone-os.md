# 3DVR Phone OS — Ubuntu Touch + Waydroid

Status: implementation roadmap; no changes to phone yet.

## Goal
One seamless, open-source Linux/Android phone experience on the experimental OnePlus, with a mobile-first 3DVR launcher.

## Priority 0: capture baseline
Record Ubuntu Touch release, device model, kernel, Waydroid image/version, systemd services, camera permissions, logs and app launch behavior. Preserve rollback and do not flash or reset.

## Priority 1: Waydroid reliability
- Auto-initialize Waydroid session at login/boot without requiring manual launcher taps.
- Android apps appear in the same launcher as Linux apps.
- Verify WhatsApp linked-device login, notification delivery, suspend/wake, clipboard, microphone, camera stills and video separately.
- Test camera in native Ubuntu Touch and Waydroid, distinguish HAL/driver versus app permission failures.
- Record battery drain and thermal behavior before enabling persistent background processes.

## Priority 2: unified interface
- Prototype a touch-first home/launcher with unified app search, quick settings, keyboard and orientation support.
- Operator entry point, but no mandatory cloud dependency for launching apps.
- Match Ubuntu Touch security model and avoid unnecessary privileged daemons.

## Priority 3: reproducible deployment
- Ship documented install/uninstall scripts with explicit permissions and rollback.
- Run integration tests on device before publishing as stable.

## Acceptance
Boot to usable launcher; launch WhatsApp without opening Waydroid manually; working still/video capture where hardware permits; reliable notifications after screen-off; no regressions in calls, networking or battery.

## Constraints
Open source; preserve personal data; do not alter production portal or flash device without device-specific validation.
