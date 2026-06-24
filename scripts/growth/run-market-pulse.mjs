#!/usr/bin/env node
import { loadLocalEnv } from '../env/load-local-env.mjs';

loadLocalEnv();
const { runMarketPulseCli } = await import('../../src/growth/market-pulse-runner.js');
const { exitCode } = await runMarketPulseCli();
process.exitCode = exitCode;
