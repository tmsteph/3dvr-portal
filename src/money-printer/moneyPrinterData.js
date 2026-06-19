// Compatibility barrel for the first MVP filename.
// New code should import focused modules or moneyPrinterCore.js directly.

export * from './moneyPrinterCore.js';
export { PROMPT_TEMPLATES } from './moneyPrinterPrompts.js';
export { BOT_DEFINITIONS } from './moneyPrinterBots.js';
export {
  AgentToolConnector,
  AnalyticsConnector,
  CrmConnector,
  EmailConnector,
  GitHubConnector,
  StripeConnector,
  VercelConnector,
  moneyPrinterConnectors,
  readConnectorStatuses
} from './moneyPrinterConnectors.js';
export {
  MONEY_PRINTER_STORAGE_KEY,
  createMoneyPrinterStorage,
  hydrateMoneyPrinterState,
  readMoneyPrinterState,
  removeMoneyPrinterState,
  writeMoneyPrinterState
} from './moneyPrinterStorage.js';
