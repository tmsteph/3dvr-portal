import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTaskPacket } from '../apps/agent/task-packet.mjs';
const valid = () => ({version:1,id:'job-1',goal:'Check formatting',expectedOutput:'Report',privacy:'internal',worker:'ovh',allowedPaths:['src/index.js'],steps:['Inspect file'],verification:['Run tests'],timeoutSeconds:60,maxRetries:1,requiresApproval:false});
test('accepts a bounded task packet',()=>assert.equal(validateTaskPacket(valid()).ok,true));
test('rejects cloud routing of restricted data',()=>assert.equal(validateTaskPacket({...valid(),privacy:'restricted',worker:'cloud'}).ok,false));
test('rejects unapproved production changes',()=>assert.equal(validateTaskPacket({...valid(),productionChange:true}).ok,false));
test('rejects traversal and unbounded retries',()=>assert.equal(validateTaskPacket({...valid(),allowedPaths:['../secret'],maxRetries:5}).ok,false));
