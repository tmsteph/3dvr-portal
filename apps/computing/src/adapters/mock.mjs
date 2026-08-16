export function createMockAdapters() {
  return {
    'browser.open': async ({ url }) => ({
      opened: url,
      adapter: 'mock-browser'
    }),
    'os.notify': async ({ title, body }) => ({
      delivered: true,
      title,
      body,
      adapter: 'mock-os'
    })
  };
}
