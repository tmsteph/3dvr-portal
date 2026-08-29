# 3DVR Desktop troubleshooting

Start with read-only diagnostics:

```sh
3dvr-desktop doctor
```

For an isolated Termux:X11 startup test that does not launch XFWM4 or 3dvr-shell:

```sh
3dvr-desktop probe-x11
```

Runtime logs live under `~/.local/state/3dvr-desktop/`. The main X11 log is `x11.log` and the
isolated probe writes `x11-probe.log`.

## After an Android reboot

Termux:Boot may start background services before Android allows graphical activities. 3DVR Desktop
therefore waits for the first normal unlock. The paired 3DVR Companion then foregrounds Termux;
newer Companion builds can foreground Termux:X11 as an explicit allow-listed app as well.

Do not add a busy loop that repeatedly forces activities over the Android lock screen. Recovery
should respect the platform lifecycle and remain quiet when the phone is locked.

## X11 says “Not connected”

Check both halves: the Android `com.termux.x11` app and the Termux `termux-x11-nightly` package.
Then run `3dvr-desktop probe-x11`. A healthy probe creates an X socket and answers an `xprop` root
query. If the command exits without a socket, the failure is below XFWM4 and `3dvr-shell`.
## Current Samsung / Android 16 investigation

On 2026-08-29 a Samsung Android 16 test device reproduced a Termux:X11 loader failure after reboot:
the viewer remained “Not connected” and the shell command exited without creating an X socket.
The same device had a working 3DVR/X11 session the previous evening with `termux-x11-nightly`
1.03.01-5. Updating both Android and shell-side X11 components did not by itself restore the server.

This is tracked as a dependency-layer issue, not silently attributed to 3DVR Desktop. Keep the VM and
Linux targets usable, keep boot/remote services recoverable, and attach the probe output when reporting
or debugging the upstream problem.

## Safe update pattern

Use the installer again to reconcile repository files. It creates a timestamped device backup first.
For a source/config-only reconciliation on an already-provisioned phone:

```sh
THREEDVR_SKIP_PACKAGES=1 ./3dvr-desktop/install.sh
```

This updates the canonical shell/scripts and boot entry without doing a broad Termux package upgrade.
