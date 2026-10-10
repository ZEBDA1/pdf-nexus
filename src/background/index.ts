import { shouldOpenDownload } from './downloads';
import { configureOpening, restoreAutomaticOpening, openLocalPdfTab } from './opening';
import { bounded } from '../utils/browser';
import { registerWebOpening } from './webOpening';

registerWebOpening();

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url?.startsWith('file:')) void openLocalPdfTab(tabId, change.url).catch(() => {});
});

let openingQueue = Promise.resolve();
function openingTask(action: () => Promise<void>) {
  const task = openingQueue.then(action);
  openingQueue = task.catch(async (e) => {
    await bounded(
      chrome.storage.local.set({
        openingError: e instanceof Error ? e.message : 'Activation impossible.',
      }),
      4000,
      'Diagnostic unavailable',
    ).catch(() => {});
  });
  return task;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id === chrome.runtime.id && message?.type === 'opening-status') {
    respond({ ready: registerWebOpening() });
    return;
  }
  if (
    sender.id !== chrome.runtime.id ||
    message?.type !== 'configure-opening' ||
    typeof message.enabled !== 'boolean'
  )
    return;
  void openingTask(() => configureOpening(message.enabled)).then(
    () => respond({ ok: true }),
    (e) => respond({ ok: false, error: e instanceof Error ? e.message : 'Activation impossible.' }),
  );
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  void openingTask(restoreAutomaticOpening).catch(() => {});
  if (details.reason === 'install')
    void chrome.tabs.create({ url: chrome.runtime.getURL('editor.html#setup') });
  void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
});
chrome.runtime.onStartup.addListener(() => {
  void openingTask(restoreAutomaticOpening).catch(() => {});
});
void openingTask(restoreAutomaticOpening).catch(() => {});

let downloadQueue = Promise.resolve();
function registerDownloads() {
  if (!chrome.downloads?.onChanged || chrome.downloads.onChanged.hasListener(onDownload)) return;
  chrome.downloads.onChanged.addListener(onDownload);
}
function onDownload(delta: chrome.downloads.DownloadDelta) {
  if (delta.state?.current !== 'complete') return;
  downloadQueue = downloadQueue
    .then(async () => {
      if (!(await chrome.storage.local.get('automaticDownloads')).automaticDownloads) return;
      const [item] = await chrome.downloads.search({ id: delta.id });
      if (!item || !shouldOpenDownload(item, chrome.runtime.id)) return;
      const stored = await chrome.storage.session.get('openedDownloads');
      const openedDownloads = Array.isArray(stored.openedDownloads) ? stored.openedDownloads : [];
      if (openedDownloads.includes(delta.id)) return;
      await chrome.storage.session.set({
        openedDownloads: [...openedDownloads.slice(-99), delta.id],
      });
      await chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html#download=${delta.id}`) });
    })
    .catch(() => {
      /* Revoked permissions or removed downloads require no background retry. */
    });
}
registerDownloads();
chrome.permissions.onAdded.addListener(() => {
  registerWebOpening();
  registerDownloads();
  void openingTask(restoreAutomaticOpening).catch(() => {});
});
