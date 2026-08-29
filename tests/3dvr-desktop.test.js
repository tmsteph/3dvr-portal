import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('3DVR Desktop exposes a portal route and reusable targets', () => {
  const page = read('3dvr-desktop/index.html');
  const readme = read('3dvr-desktop/README.md');
  const termux = read('3dvr-desktop/scripts/start-termux.sh');
  const linux = read('3dvr-desktop/scripts/start-linux.sh');

  assert.match(page, /3DVR Desktop/);
  assert.match(readme, /desktop environment/i);
  assert.match(readme, /Termux:X11/);
  assert.match(termux, /termux-x11/);
  assert.match(termux, /proot-distro login debian/);
  assert.match(linux, /startx/);
});

test('3DVR Desktop session has a panel, launcher, and terminal', () => {
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

  assert.match(install, /\.termux\/boot\/00-3dvr-start/);
  assert.match(install, /Termux:Boot/);
  assert.match(boot, /desktop-commander remote/);
  assert.match(boot, /3dvr agent start/);
  assert.match(boot, /3dvr-desktop start/);
  assert.match(boot, /com\.termux\.x11/);
});
