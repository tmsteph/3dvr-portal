import { HostedTaskStore } from '../src/operator-runtime/hosted-task-store.js';

// Trusted operator CLI only; neither task bodies nor HTTP APIs provision allowances.
const [action, tenantId, amount] = process.argv.slice(2);
const path = process.env.HOSTED_OPERATOR_PILOT_STORE;
if (action !== 'set' || !path || !tenantId || !/^\d+$/.test(amount || '')) {
  process.stderr.write('Usage: HOSTED_OPERATOR_PILOT_STORE=/private/tasks.json node scripts/hosted-operator-budget.mjs set sea:PUBLIC_KEY ALLOWANCE_CENTS\n');
  process.exitCode = 1;
} else {
  try {
    const budget = await new HostedTaskStore(path).setBudget(tenantId, Number(amount));
    process.stdout.write(JSON.stringify(budget) + '\n');
  } catch (error) {
    process.stderr.write(String(error.message) + '\n');
    process.exitCode = 1;
  }
}
