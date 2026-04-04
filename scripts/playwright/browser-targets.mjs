import process from 'node:process';

const CHROMIUM_LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader'];

const BROWSER_TARGETS = Object.freeze({
  chromium: Object.freeze({
    id: 'chromium',
    browserType: 'chromium',
    installTarget: 'chromium',
    displayName: 'Chromium',
  }),
  chrome: Object.freeze({
    id: 'chrome',
    browserType: 'chromium',
    installTarget: 'chrome',
    channel: 'chrome',
    displayName: 'Chrome',
  }),
  firefox: Object.freeze({
    id: 'firefox',
    browserType: 'firefox',
    installTarget: 'firefox',
    displayName: 'Firefox',
  }),
  webkit: Object.freeze({
    id: 'webkit',
    browserType: 'webkit',
    installTarget: 'webkit',
    displayName: 'WebKit',
  }),
  safari: Object.freeze({
    id: 'safari',
    browserType: 'webkit',
    installTarget: 'webkit',
    displayName: 'Safari (WebKit)',
  }),
});

const BROWSER_ALIASES = Object.freeze({
  chromium: 'chromium',
  chrome: 'chrome',
  'google-chrome': 'chrome',
  firefox: 'firefox',
  webkit: 'webkit',
  safari: 'safari',
});

export const DEFAULT_BROWSER_TARGET = 'chromium';
export const DEFAULT_INSTALL_BROWSERS = ['chromium', 'firefox'];

function normalizeBrowserAlias(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return BROWSER_ALIASES[normalized] || '';
}

export function resolvePlaywrightBrowser(value = '', fallback = DEFAULT_BROWSER_TARGET) {
  return resolvePlaywrightBrowserForRuntime(value, fallback, process.platform, process.arch);
}

function shouldUseChromiumFallbackForChrome(platform = process.platform, arch = process.arch) {
  return platform === 'linux' && arch === 'arm64';
}

function resolveRuntimeTarget(targetId, platform = process.platform, arch = process.arch) {
  if (targetId === 'chrome' && shouldUseChromiumFallbackForChrome(platform, arch)) {
    return {
      id: 'chrome',
      browserType: 'chromium',
      installTarget: 'chromium',
      displayName: 'Chrome (Chromium fallback)',
      usesFallback: true,
    };
  }

  return BROWSER_TARGETS[targetId] || BROWSER_TARGETS[DEFAULT_BROWSER_TARGET];
}

export function resolvePlaywrightBrowserForRuntime(
  value = '',
  fallback = DEFAULT_BROWSER_TARGET,
  platform = process.platform,
  arch = process.arch,
) {
  const normalizedFallback = normalizeBrowserAlias(fallback) || DEFAULT_BROWSER_TARGET;
  const normalizedValue = normalizeBrowserAlias(value);
  const targetId = normalizedValue || normalizedFallback;
  const target = resolveRuntimeTarget(targetId, platform, arch);

  return {
    ...target,
    requested: String(value || '').trim().toLowerCase() || normalizedFallback,
  };
}

export function normalizeInstallBrowserTarget(value = '') {
  return normalizeInstallBrowserTargetForRuntime(value, process.platform, process.arch);
}

export function normalizeInstallBrowserTargetForRuntime(
  value = '',
  platform = process.platform,
  arch = process.arch,
) {
  const normalized = normalizeBrowserAlias(value);
  if (normalized) {
    return resolveRuntimeTarget(normalized, platform, arch).installTarget;
  }

  return String(value || '').trim().toLowerCase();
}

export function buildPlaywrightLaunchOptions(browser = resolvePlaywrightBrowser()) {
  const options = {
    headless: true,
  };

  if (browser.browserType === 'chromium') {
    options.args = [...CHROMIUM_LAUNCH_ARGS];
  }

  if (browser.channel) {
    options.channel = browser.channel;
  }

  return options;
}

function getErrorMessage(error) {
  return error && typeof error.message === 'string' ? error.message : String(error);
}

export function isUnsupportedPlaywrightRuntime(error) {
  return getErrorMessage(error).includes('Unsupported platform');
}

export function isMissingPlaywrightRuntime(error) {
  const message = getErrorMessage(error);
  return (
    message.includes('dependencies to run browsers')
    || message.includes('Executable doesn\'t exist')
    || message.includes('distribution \'chrome\' is not found')
  );
}

const browserTypeCache = new Map();

export async function resolvePlaywrightBrowserType(browser = resolvePlaywrightBrowser()) {
  if (browserTypeCache.has(browser.browserType)) {
    return browserTypeCache.get(browser.browserType);
  }

  const playwright = await import('playwright');
  const browserType = playwright[browser.browserType];
  if (!browserType) {
    throw new Error(`Playwright browser "${browser.browserType}" is unavailable in this environment.`);
  }

  browserTypeCache.set(browser.browserType, browserType);
  return browserType;
}

export async function launchConfiguredPlaywrightBrowser(browser = resolvePlaywrightBrowser()) {
  const browserType = await resolvePlaywrightBrowserType(browser);
  return browserType.launch(buildPlaywrightLaunchOptions(browser));
}

export async function launchBrowserForTest(t, browser = resolvePlaywrightBrowser()) {
  try {
    return await launchConfiguredPlaywrightBrowser(browser);
  } catch (error) {
    if (isUnsupportedPlaywrightRuntime(error)) {
      t.skip(`Playwright ${browser.displayName} is not supported on this platform.`);
      return null;
    }

    if (isMissingPlaywrightRuntime(error)) {
      t.skip(`Playwright ${browser.displayName} runtime is not installed in this environment.`);
      return null;
    }

    throw error;
  }
}

export async function createPlaywrightContext(browserInstance) {
  try {
    return await browserInstance.newContext({ serviceWorkers: 'block' });
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes('serviceWorkers')) {
      return browserInstance.newContext();
    }
    throw error;
  }
}
