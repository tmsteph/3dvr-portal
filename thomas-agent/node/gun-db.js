const Gun = require('gun');

const RELAY = process.env.THREEDVR_GUN_RELAY || 'wss://gun-relay-3dvr.fly.dev/gun';
const APP_ROOT = process.env.THREEDVR_GUN_ROOT || '3dvr';
const CRM_ROOT = process.env.THREEDVR_GUN_CRM || 'crm';
const LEADS_ROOT = process.env.THREEDVR_GUN_LEADS || 'leads';
const OUTREACH_ARTIFACTS_ROOT = process.env.THREEDVR_GUN_OUTREACH_ARTIFACTS || 'outreach-artifacts';
const OPS_ROOT = process.env.THREEDVR_GUN_OPS || 'ops';
const AUTOPILOT_ROOT = process.env.THREEDVR_GUN_AUTOPILOT || 'autopilot';
const PORTAL_ROOT = process.env.THREEDVR_GUN_PORTAL_ROOT || '3dvr-portal';

const gun = Gun({
  peers: [RELAY],
});

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function leadsNode() {
  return gun.get(APP_ROOT).get(CRM_ROOT).get(LEADS_ROOT);
}

function outreachArtifactsNode() {
  return gun.get(APP_ROOT).get(CRM_ROOT).get(OUTREACH_ARTIFACTS_ROOT);
}

function autopilotRunsNode() {
  return gun.get(APP_ROOT).get(OPS_ROOT).get(AUTOPILOT_ROOT).get('runs');
}

function autopilotStateNode() {
  return gun.get(APP_ROOT).get(OPS_ROOT).get(AUTOPILOT_ROOT).get('state');
}

function portalAgentOpsNode() {
  return gun.get(PORTAL_ROOT).get('agentOps');
}

module.exports = {
  gun,
  RELAY,
  APP_ROOT,
  CRM_ROOT,
  LEADS_ROOT,
  OUTREACH_ARTIFACTS_ROOT,
  OPS_ROOT,
  AUTOPILOT_ROOT,
  PORTAL_ROOT,
  leadsNode,
  outreachArtifactsNode,
  autopilotRunsNode,
  autopilotStateNode,
  portalAgentOpsNode,
  slugify,
};
