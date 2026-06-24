#!/usr/bin/env node
import { loadLocalEnv } from '../env/load-local-env.mjs';

loadLocalEnv();
const { runMetaMarketWorkerCli } = await import('../../src/growth/meta-market-worker.js');
const { exitCode } = await runMetaMarketWorkerCli();
process.exit(exitCode);
