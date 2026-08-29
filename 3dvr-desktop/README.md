# 3DVR Desktop

3DVR Desktop is the native desktop environment for 3DVR personal computing. It is intended
to be a reusable environment in the same product category as GNOME or KDE, while staying
small enough for a phone, a tiny VM, or a normal Linux machine.

## Architecture

The Android/Termux implementation is the primary reference today:

- **3dvr-shell** — our GTK home screen, app launcher, running-app overview, top bar, touch controls, and window actions.
- **XFWM4** — the underlying X11 window manager.
- **Termux:X11** — the Android display server and touch/input bridge.
- **XFCE utilities** — terminal, files, settings, and lightweight supporting services.
- **3DVR launchers** — phone-aware wrappers for Firefox, Chromium, Terminal, Files, Settings, and the 3DVR cockpit.

The ordinary Linux/VM target currently uses Openbox + Tint2 + Rofi as a lightweight fallback.
Those are implementation pieces, not the identity of 3DVR Desktop, and can be replaced over time.

## Targets

- `termux`: native Android + Termux:X11 + XFWM4 + `3dvr-shell`; Debian proot is not required for the desktop.
- `linux`: Debian-family Linux using Xorg + the lightweight fallback session.
- `vm`: the Linux target inside `termux-ui-lab` for safe desktop testing.

## Install and run

```sh
./3dvr-desktop/install.sh
3dvr-desktop doctor
3dvr-desktop start
```

On Termux the installer builds `native/shell.c` into `~/3dvr-shell/3dvr-shell`, installs the
phone launcher scripts, and creates `~/.termux/boot/02-3dvr-desktop` for Termux:Boot.
The boot entry starts the already-authorized remote control if needed, starts the 3DVR agent
when present, brings Termux forward, and starts the graphical session automatically.

## Source of truth

The native shell in `native/` and `scripts/phone/` was captured from the working phone setup
built on August 28, 2026. Device-local edits should be reconciled back here so the monorepo,
not an individual phone, remains the canonical desktop implementation.

## Relationship to Daedalos

Daedalos / TommyOS in `3dvr-os/` is the browser-native desktop. 3DVR Desktop is the native
Linux/X11 desktop. They are two runtimes of the same long-term personal-computing system.
