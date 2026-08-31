#!/usr/bin/env node
import dgram from 'node:dgram';

const port = Number(process.env.SHOW_DISCOVERY_PORT || 47770);
const timeoutMs = Number(process.env.SHOW_DISCOVERY_TIMEOUT || 1500);
const socket = dgram.createSocket('udp4');
const found = new Map();

socket.on('message', (msg, rinfo) => {
  try {
    const node = JSON.parse(msg.toString());
    node.address = rinfo.address;
    found.set(node.id || `${rinfo.address}:${node.httpPort}`, node);
    console.log(JSON.stringify(node, null, 2));
  } catch {}
});

socket.bind(0, '0.0.0.0', () => {
  socket.setBroadcast(true);
  socket.send(Buffer.from('3DVR_SHOW_DISCOVER_V1'), port, '255.255.255.255');
  setTimeout(() => {
    if (!found.size) console.error('No 3DVR Show nodes found.');
    socket.close();
  }, timeoutMs);
});
