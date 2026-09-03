import http from 'node:http';
import { createOrganismBridgeHandler } from '../src/organism/bridge.js';

const host = process.env.THREEDVR_ORGANISM_BRIDGE_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.THREEDVR_ORGANISM_BRIDGE_PORT || '4321', 10);
const handler = createOrganismBridgeHandler();

const server = http.createServer((req, res) => {
  Promise.resolve(handler(req, res)).catch(error => {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (!res.writableEnded) res.end(JSON.stringify({ ok: false, error: 'Internal server error.' }));
  });
});

server.listen(port, host, () => {
  console.log(`3DVR Organism owner bridge listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down Organism bridge.`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
