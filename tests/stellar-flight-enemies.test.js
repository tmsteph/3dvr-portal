import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('stellar drift spawns random hostile drones', async () => {
  const html = await readFile(new URL('../stellar-flight.html', import.meta.url), 'utf8');

  assert.match(html, /id="enemyCounter"/);
  assert.match(html, /Random hostile drones now phase into the drift lanes/);
  assert.match(html, /const MAX_RANDOM_ENEMIES = 5;/);
  assert.match(html, /const ENEMY_SPAWN_MIN_SECONDS = 3\.5;/);
  assert.match(html, /function createEnemyDrone\(\)/);
  assert.match(html, /function updateEnemies\(delta\)/);
  assert.match(html, /function spawnEnemyBolt\(enemy\)/);
  assert.match(html, /function damageEnemy\(enemy, amount\)/);
  assert.match(html, /Hostile drone cleared/);
  assert.match(html, /updateEnemies\(delta\);\s+updateEnemyBolts\(delta\);\s+updateLasers\(delta\);/);
});

