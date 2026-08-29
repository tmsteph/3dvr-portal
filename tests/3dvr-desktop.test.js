import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('3DVR Desktop exposes native Termux and Linux targets', () => {
  const page = read('3dvr-desktop/index.html');
  const readme = read('3dvr-desktop/README.md');
  const termux = read('3dvr-desktop/scripts/start-termux.sh');
  const linux = read('3dvr-desktop/scripts/start-linux.sh');

  assert.match(page, /3DVR Desktop/);
  assert.match(readme, /desktop environment/i);
  assert.match(readme, /3dvr-shell/);
  assert.match(readme, /XFWM4/);
  assert.match(termux, /termux-x11/);
  assert.match(termux, /start-3dvr-shell-session/);
  assert.doesNotMatch(termux, /proot-distro/);
  assert.match(linux, /startx/);
});

test('native Termux shell is buildable source with phone launchers', () => {
  const shell = read('3dvr-desktop/native/shell.c');
  const build = read('3dvr-desktop/scripts/build-termux-shell.sh');
  const session = read('3dvr-desktop/scripts/phone/start-3dvr-shell-session');

  assert.match(shell, /#include <gtk\/gtk\.h>/);
  assert.match(shell, /3DVR/);
  assert.match(build, /clang -O2/);
  assert.match(build, /gtk\+-3\.0 x11 xext/);
  assert.match(session, /xfwm4 --replace/);
  assert.match(session, /3dvr-shell/);
});

test('Linux fallback keeps panel, launcher, and terminal', () => {
  const autostart = read('3dvr-desktop/config/openbox/autostart');
  const panel = read('3dvr-desktop/config/tint2/tint2rc');
  const launcher = read('3dvr-desktop/config/applications/3dvr-launcher.desktop');

  assert.match(autostart, /tint2/);
  assert.match(autostart, /xterm/);
  assert.match(panel, /3dvr-launcher\.desktop/);
  assert.match(launcher, /rofi -show drun/);
});

test('Termux install creates unlock-aware Android boot startup', () => {
  const install = read('3dvr-desktop/scripts/install-termux.sh');
  const boot = read('3dvr-desktop/scripts/termux-boot.sh');
  const afterUnlock = read('3dvr-desktop/scripts/phone/start-after-unlock.sh');

  assert.match(install, /\.termux\/boot\/02-3dvr-desktop/);
  assert.match(install, /build-termux-shell\.sh/);
  assert.match(boot, /3dvr agent start/);
  assert.match(boot, /start-after-unlock\.sh/);
  assert.match(afterUnlock, /3dvr-desktop start/);
});

test('Termux startup verifies a real X11 display before starting the shell', () => {
  const start = read('3dvr-desktop/scripts/start-termux.sh');
  assert.match(start, /\.X11-unix/);
  assert.match(start, /xprop -root/);
  assert.match(start, /Termux:X11 did not become ready/);
  assert.match(start, /start-3dvr-shell-session/);
  assert.match(start, /\nam start .*com\.termux\.x11/);
  assert.doesNotMatch(start, /\/system\/bin\/am start/);
});

test('Android boot waits for unlock and uses the Companion foreground handoff', () => {
  const wait = read('3dvr-desktop/scripts/phone/await-android-ready.py');
  assert.match(wait, /\/v1\/ui\/snapshot/);
  assert.match(wait, /device locked/);
  assert.match(wait, /\/v1\/open-app/);
  assert.match(wait, /'alias': 'termux'/);
  assert.match(wait, /'alias': 'termux_x11'/);
});

test('Termux doctor and probe make dependency failures observable', () => {
  const cli = read('3dvr-desktop/bin/3dvr-desktop');
  const doctor = read('3dvr-desktop/scripts/doctor-termux.sh');
  const probe = read('3dvr-desktop/scripts/probe-termux-x11.sh');

  assert.match(cli, /probe-x11/);
  assert.match(doctor, /com\.termux\.x11/);
  assert.match(doctor, /com\.termux\.boot/);
  assert.match(doctor, /3DVR Companion bridge/);
  assert.match(probe, /x11-probe\.log/);
  assert.match(probe, /xprop -root/);
});

test('Companion keeps Termux:X11 as an explicit allow-listed Android target', () => {
  const activity = read('apps/companion/native-spec/android/MainActivity.kt');
  const bridge = read('apps/companion/native-spec/android/CompanionNativeBridgeServer.kt');
  assert.match(activity, /"termux_x11" to listOf\("com\.termux\.x11"\)/);
  assert.match(bridge, /"termux_x11" to listOf\("com\.termux\.x11"\)/);
});

test('desktop architecture and troubleshooting are checked in', () => {
  const architecture = read('3dvr-desktop/ARCHITECTURE.md');
  const troubleshooting = read('3dvr-desktop/TROUBLESHOOTING.md');
  assert.match(architecture, /Source-of-truth rule/);
  assert.match(troubleshooting, /probe-x11/);
  assert.match(troubleshooting, /Android 16/);
});
