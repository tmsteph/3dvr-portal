#!/usr/bin/env node
import { runMetaMarketWorkerCli } from '../../src/growth/meta-market-worker.js';

const { exitCode } = await runMetaMarketWorkerCli();
process.exit(exitCode);
