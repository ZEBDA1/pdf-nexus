import { bounded } from '../utils/browser';

type PdfResponse = Pick<
  chrome.webRequest.OnResponseStartedDetails,
  'url' | 'tabId' | 'type' | 'method' | 'statusCode' | 'responseHeaders'
>;

export function isWebPdfResponse(details: PdfResponse) {
  if (
    details.tabId < 0 ||
    details.type !== 'main_frame' ||
    details.method !== 'GET' ||
    details.statusCode < 200 ||
    details.statusCode >= 300
  )
    return false;
  const url = new URL(details.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
  const header = (name: string) =>
    details.responseHeaders?.find((h) => h.name.toLowerCase() === name)?.value || '';
  // Attachments belong to the separate download opt-in. Do not open subframes,
  // fetches made by Nexus, HTML pages called .pdf, or failed/authenticated responses.
  return (
    /^application\/pdf(?:\s*;|\s*$)/i.test(header('content-type')) &&
    !/^\s*attachment(?:\s*;|\s*$)/i.test(header('content-disposition'))
  );
}

export async function openWebPdfResponse(details: PdfResponse) {
  if (!isWebPdfResponse(details)) return;
  const state = await bounded(
    chrome.storage.local.get('automaticOpening'),
    4000,
    'Chrome ne répond pas à la lecture du réglage (storage.local.get).',
  );
  if (!state.automaticOpening) return;
  const tab = await chrome.tabs.get(details.tabId);
  // Never pull the user back after they started a different navigation while
  // the previous PDF response was arriving. Hosts grant access to these URLs.
  const current = tab.pendingUrl || tab.url;
  if (!current || current.split('#')[0] !== details.url.split('#')[0]) return;
  await chrome.tabs.update(details.tabId, {
    url: chrome.runtime.getURL('editor.html') + '#url=' + current,
  });
}

function onPdfResponse(details: chrome.webRequest.OnResponseStartedDetails) {
  void openWebPdfResponse(details).catch(() => {
    // A closed tab, revoked access or a superseded navigation needs no retry.
  });
}

/** Register synchronously in the worker, including every wake-up after suspension. */
export function registerWebOpening() {
  const event = chrome.webRequest?.onResponseStarted;
  if (!event) return false;
  try {
    if (!event.hasListener(onPdfResponse))
      event.addListener(
        onPdfResponse,
        { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
        ['responseHeaders'],
      );
    return event.hasListener(onPdfResponse);
  } catch {
    return false;
  }
}
