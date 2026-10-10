import { chromium } from '@playwright/test';

export async function launchExtension(
  channel: 'chromium' | 'msedge' | 'chrome',
  extension: string,
  profile = '',
) {
  const context = await chromium.launchPersistentContext(profile, {
    channel,
    headless: true,
    ...(channel === 'chrome'
      ? {
          args: ['--enable-unsafe-extension-debugging'],
          ignoreDefaultArgs: ['--disable-extensions'],
        }
      : { args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] }),
  });
  if (channel === 'chrome') {
    // Chrome removed --load-extension; use its test-only CDP endpoint solely in
    // this temporary profile, never attach to the user's normal browser.
    const cdp = await context.browser()!.newBrowserCDPSession();
    await cdp.send('Extensions.loadUnpacked', { path: extension });
    await cdp.detach();
  }
  return context;
}
