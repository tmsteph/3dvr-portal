# 3DVR Desktop architecture

3DVR Desktop is a portable desktop environment with one product identity and multiple runtimes.
The goal is not to fork every component. 3DVR owns the session, shell, defaults, launch behavior,
recovery, and cross-device experience while reusing strong open-source building blocks.

## Native phone runtime

```text
Android
  ├─ 3DVR Companion        Android-native, permissioned control bridge
  ├─ Termux:Boot           post-boot entry point
  ├─ Termux:X11            X server + Android touch/input viewer
  └─ Termux
       ├─ XFWM4            window manager
       ├─ 3dvr-shell       3DVR home/launcher/window UI
       ├─ XFCE utilities   terminal, files, settings
       └─ 3DVR agent       optional automation/control services
```

The desktop itself is native Termux. A Debian proot may still be useful for Linux software,
but it is not required to render or manage the 3DVR Desktop session.

## Boot lifecycle

Termux:Boot starts non-graphical services first. The graphical supervisor waits for Android's
first normal unlock, asks the already-paired 3DVR Companion to foreground Termux, and then starts
Termux:X11 and the 3DVR session. This keeps reboot recovery compatible with Android's lock-screen
and background-activity restrictions instead of trying to bypass them.
## Linux and VM runtime

Normal Linux and `termux-ui-lab` currently use Xorg + Openbox + Tint2 + Rofi. That fallback is
intentionally boring and reproducible: it gives us a safe lab for shell/session work while the
phone runtime evolves. Components can converge later without changing the 3DVR Desktop identity.

## Control plane

The 3DVR Companion exposes named capabilities such as UI snapshots, taps, navigation, and opening
known apps. It does not expose arbitrary Android package execution. Termux supplies the Linux shell,
source tree, compilers, and processes. Together they let an agent reason about both Android UI state
and the Linux environment without turning the phone into an unrestricted remote shell.

## Source-of-truth rule

Device-local experimentation is temporary. Once a behavior works, move the source/config/script into
`3dvr-desktop/`, add a test or doctor check, and reinstall from the monorepo. A phone or VM should be
replaceable; the repository should be sufficient to reconstruct the environment.
