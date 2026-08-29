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

test('Termux install creates Android boot startup', () => {
  const install = read('3dvr-desktop/scripts/install-termux.sh');
  const boot = read('3dvr-desktop/scripts/termux-boot.sh');

  assert.match(install, /\.termux\/boot\/02-3dvr-desktop/);
  assert.match(install, /build-termux-shell\.sh/);
  assert.match(boot, /TermuxActivity/);
  assert.match(boot, /3dvr agent start/);
  assert.match(boot, /3dvr-desktop start/);
});

test('Termux activity launches use the Termux am compatibility wrapper', () => {
  const start = read('3dvr-desktop/scripts/start-termux.sh');
  const boot = read('3dvr-desktop/scripts/termux-boot.sh');

  assert.match(start, /\nam start .*com\.termux\.x11/);
  assert.match(boot, /\nam start .*com\.termux\//);
  assert.doesNotMatch(start, /\/system\/bin\/am start/);
  assert.doesNotMatch(boot, /\/system\/bin\/am start/);
});
