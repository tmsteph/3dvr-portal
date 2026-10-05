// Pure shared models imported by browser entrypoints; all other /src files stay private.
const PUBLIC_SHARED_MODULES = new Set([
  '/src/operator-runtime/action-receipt.js',
  '/src/operator-runtime/work-item.js',
  '/src/operator-runtime/task-queue-adapter.js',
  '/src/operator-runtime/runtime-sidecar.js',
  '/src/kernel/positiveSum.js'
]);

const PRIVATE_PREFIXES = [
  '/.github/', '/api/', '/src/', '/scripts/', '/tests/', '/ops/', '/node_modules/', '/apps/agent/'
];
const PRIVATE_ROOT_FILES = new Set([
  '/package.json', '/package-lock.json', '/vercel.json', '/AGENTS.md', '/.gitignore'
]);

export function isPrivateStaticPath(pathname) {
  const clean = String(pathname || '/');
  if (PUBLIC_SHARED_MODULES.has(clean)) return false;
  return PRIVATE_ROOT_FILES.has(clean)
    || PRIVATE_PREFIXES.some(prefix => clean === prefix.slice(0, -1) || clean.startsWith(prefix));
}

