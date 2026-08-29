# 3DVR Desktop

3DVR Desktop is the native desktop environment for 3DVR personal computing.
It is intentionally small enough to run on a phone through Termux:X11, in a tiny VM,
or on a normal Debian/Linux machine.

Think of it as the 3DVR equivalent of a lightweight GNOME or KDE session:

- Openbox manages windows.
- Tint2 provides the panel and task switcher.
- Rofi is the application launcher.
- PCManFM provides lightweight file browsing.
- Xterm is the baseline terminal.
- 3DVR owns the session, defaults, launchers, install flow, and cross-device behavior.

## Targets

- `termux`: Android + Termux:X11 + Debian `proot-distro`
- `linux`: Debian or Debian-derived Linux using Xorg
- `vm`: the same Linux target inside `termux-ui-lab`

## Install

```sh
./3dvr-desktop/install.sh
```

The installer detects Termux versus normal Linux. Then start the desktop with:

```sh
3dvr-desktop start
```

Check the environment with:

```sh
3dvr-desktop doctor
```

## Relationship to Daedalos

Daedalos / TommyOS is the browser-native desktop in `3dvr-os/`. 3DVR Desktop is the
native Linux/X11 desktop. The long-term goal is one 3DVR computing experience with a
web shell when the browser is the best runtime and a native shell when Linux is available.

## Status

This first checked-in baseline was captured from the working `termux-ui-lab` VM. The
phone's live Termux configuration should be reconciled into this directory whenever the
phone endpoint is online, so the repository remains the source of truth rather than any device.

## Android boot automation

The Termux installer creates `~/.termux/boot/00-3dvr-start`. With the Termux:Boot
companion app installed and opened once, Android runs this script after reboot. It starts
the existing Desktop Commander remote command, the 3DVR agent when installed, and
3DVR Desktop / Termux:X11. It also asks Android to foreground Termux and Termux:X11.
Recent Android versions may block automatic foreground launches, but the background
startup still works.
