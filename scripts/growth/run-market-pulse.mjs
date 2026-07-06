#!/usr/bin/env node
import { runMarketPulseCli } from '../../src/growth/market-pulse-runner.js';

const { exitCode } = await runMarketPulseCli();
process.exitCode = exitCode;
process.exit(exitCode);
