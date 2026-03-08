import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
let routingSource = '';

function loadRouting() {
  const sandbox = {
    URLSearchParams,
    window: {}
  };

  vm.runInNewContext(routingSource, sandbox, {
    filename: 'chat/notification-routing.js'
  });

  return sandbox.window.ChatNotificationRouting;
}

describe('chat notification routing', () => {
  before(async () => {
    routingSource = await readFile(resolve(projectRoot, 'chat/notification-routing.js'), 'utf8');
  });

  it('parses canonical room and message hashes', () => {
    const routing = loadRouting();

    const route = routing.parseChatLocationHash('#room=support&message=msg_123');

    assert.equal(route.room, 'support');
    assert.equal(route.messageId, 'msg_123');
    assert.equal(route.hasExplicitRoom, true);
  });

  it('parses legacy room hashes for backward compatibility', () => {
    const routing = loadRouting();

    const route = routing.parseChatLocationHash('#ideas/message-42');

    assert.equal(route.room, 'ideas');
    assert.equal(route.messageId, 'message-42');
    assert.equal(route.hasExplicitRoom, true);
  });

  it('falls back to general for unknown rooms', () => {
    const routing = loadRouting();

    const route = routing.parseChatLocationHash('#room=unknown-room&message=test');

    assert.equal(route.room, 'general');
    assert.equal(route.messageId, 'test');
    assert.equal(route.hasExplicitRoom, true);
  });

  it('builds canonical chat notification URLs', () => {
    const routing = loadRouting();

    const url = routing.buildChatNotificationUrl({
      room: 'random',
      messageId: 'id with spaces'
    });

    assert.equal(url, '/chat/#room=random&message=id+with+spaces');
  });

  it('wires the chat page and service worker to the shared routing helper', async () => {
    const chatHtml = await readFile(resolve(projectRoot, 'chat/index.html'), 'utf8');
    const serviceWorker = await readFile(resolve(projectRoot, 'service-worker.js'), 'utf8');

    assert.match(chatHtml, /<script src="\/chat\/notification-routing\.js"><\/script>/);
    assert.match(chatHtml, /function handleNotificationNavigation\(target = \{\}\)/);
    assert.match(chatHtml, /window\.addEventListener\('hashchange'/);
    assert.match(chatHtml, /const pushConfigEndpoint = '\/api\/chat\/push';/);
    assert.match(chatHtml, /const pushSubscriptionEndpoint = '\/api\/chat\/push';/);
    assert.match(chatHtml, /const pushNotifyEndpoint = '\/api\/chat\/push\?action=notify';/);
    assert.match(chatHtml, /async function enablePushNotifications/);
    assert.match(chatHtml, /notifyMessageDelivery\(currentRoom, messageId\);/);

    assert.match(serviceWorker, /importScripts\('\/chat\/notification-routing\.js'\);/);
    assert.match(serviceWorker, /self\.addEventListener\('push'/);
    assert.match(serviceWorker, /hasVisibleChatClient/);
    assert.match(serviceWorker, /client\.postMessage\(\{\s*type: 'notification-clicked'/);
    assert.match(serviceWorker, /await client\.navigate\(targetUrl\)/);
  });
});
