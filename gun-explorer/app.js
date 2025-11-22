const prNumber = '{{PR_NUMBER}}';
const relayUrl = '{{WSS_RELAY_URL}}';

function applyRuntimeConfig() {
  if (typeof window === 'undefined') return;
  if (!prNumber.includes('{{')) {
    window.__PR_NUMBER__ = prNumber;
  }
  if (!relayUrl.includes('{{')) {
    window.__GUN_RELAY__ = relayUrl;
  }
  window.__APP_NAME__ = window.__APP_NAME__ || '3dvr-tech';
}

applyRuntimeConfig();
import('/src/gun/explorer.js');
