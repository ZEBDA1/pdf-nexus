import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  restoreAutomaticOpening,
  automaticOpeningEnabled,
  openTabInNexus,
  setAutomaticOpening,
  configureOpening,
  setAutomaticDownloads,
  setLocalOpening,
  openLocalPdfTab,
} from '../src/background/opening';
import { isWebPdfResponse, openWebPdfResponse } from '../src/background/webOpening';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function browser(_rules: Array<{ id: number }> = [], granted = true) {
  let state: Record<string, unknown> = {};
  let listener: unknown;
  const api = {
    runtime: {
      getURL: (path: string) => 'chrome-extension://nexus/' + path,
      sendMessage: vi.fn(async () => ({ ok: true, ready: true })),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({ ...state })),
        set: vi.fn(async (values: Record<string, unknown>) => {
          state = { ...state, ...values };
        }),
      },
    },
    permissions: {
      contains: vi.fn(async () => granted),
      request: vi.fn(async () => granted),
      remove: vi.fn(async () => {
        granted = false;
        return true;
      }),
    },
    webRequest: {
      onResponseStarted: {
        addListener: vi.fn((callback: unknown) => {
          listener = callback;
        }),
        hasListener: vi.fn((callback: unknown) => listener === callback),
      },
    },
    tabs: {
      get: vi.fn(async () => ({
        url: 'https://example.org/document-pdf',
        pendingUrl: undefined as string | undefined,
      })),
      update: vi.fn(async () => {}),
    },
    extension: { isAllowedFileSchemeAccess: vi.fn(async () => true) },
    declarativeNetRequest: {
      updateDynamicRules: vi.fn(() => new Promise(() => {})),
      updateSessionRules: vi.fn(() => new Promise(() => {})),
    },
  };
  vi.stubGlobal('chrome', api);
  return api;
}
const response = {
  url: 'https://example.org/document-pdf',
  tabId: 12,
  type: 'main_frame' as const,
  method: 'GET',
  statusCode: 200,
  responseHeaders: [{ name: 'Content-Type', value: 'application/pdf' }],
};
describe('Ouverture web indépendante des règles DNR', () => {
  it('active sans appeler les deux API de règles bloquées', async () => {
    const api = browser();
    await configureOpening(true);
    expect(await automaticOpeningEnabled()).toBe(true);
    expect(api.declarativeNetRequest.updateDynamicRules).not.toHaveBeenCalled();
    expect(api.declarativeNetRequest.updateSessionRules).not.toHaveBeenCalled();
    expect(api.webRequest.onResponseStarted.addListener).toHaveBeenCalledWith(
      expect.any(Function),
      { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
      ['responseHeaders'],
    );
  });
  it('demande la détection web dans le geste utilisateur, sans permission bloquante', async () => {
    const api = browser();
    const operation = setAutomaticOpening(true);
    expect(api.permissions.request).toHaveBeenCalledWith({
      permissions: ['webRequest'],
      origins: ['https://*/*', 'http://*/*'],
    });
    await operation;
    expect(api.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'configure-opening',
      enabled: true,
    });
  });
  it('réutilise un accès accordé sans nouveau dialogue', async () => {
    const api = browser();
    await setAutomaticOpening(true, true);
    expect(api.permissions.request).not.toHaveBeenCalled();
  });
  it('ne prétend pas fonctionner sans le listener du worker', async () => {
    const api = browser();
    await api.storage.local.set({ automaticOpening: true });
    api.runtime.sendMessage.mockResolvedValue({ ok: true, ready: false });
    expect(await automaticOpeningEnabled()).toBe(false);
    api.webRequest.onResponseStarted.addListener.mockImplementation(() => {
      throw new Error('registration failed');
    });
    await expect(configureOpening(true)).rejects.toThrow('détection');
  });
  it('termine avec une erreur si le worker ne répond pas', async () => {
    vi.useFakeTimers();
    const api = browser();
    api.runtime.sendMessage.mockImplementation(() => new Promise(() => {}));
    const operation = expect(setAutomaticOpening(true, true)).rejects.toThrow(
      'service d’ouverture',
    );
    await vi.advanceTimersByTimeAsync(10001);
    await operation;
  });
  it('reconnaît une permission effective même sans retour du dialogue', async () => {
    vi.useFakeTimers();
    const api = browser();
    api.permissions.request.mockImplementation(() => new Promise(() => {}));
    const operation = setAutomaticOpening(true);
    await vi.advanceTimersByTimeAsync(301);
    await operation;
    expect(api.runtime.sendMessage).toHaveBeenCalled();
  });
  it('borne l’attente sans inventer une autorisation', async () => {
    vi.useFakeTimers();
    const api = browser([], false);
    api.permissions.request.mockImplementation(() => new Promise(() => {}));
    const operation = expect(setAutomaticOpening(true)).rejects.toThrow('n’a pas abouti');
    await vi.advanceTimersByTimeAsync(60001);
    await operation;
    expect(api.storage.local.set).toHaveBeenLastCalledWith({ automaticOpening: false });
    expect(api.runtime.sendMessage).not.toHaveBeenCalled();
  });
  it('respecte un refus de permission', async () => {
    const api = browser([], false);
    await expect(setAutomaticOpening(true)).rejects.toThrow('refusée');
    expect(api.runtime.sendMessage).not.toHaveBeenCalled();
  });
  it('restaure uniquement un choix explicite et autorisé après redémarrage', async () => {
    const api = browser();
    await restoreAutomaticOpening();
    expect(api.webRequest.onResponseStarted.addListener).not.toHaveBeenCalled();
    await api.storage.local.set({ automaticOpening: true });
    await restoreAutomaticOpening();
    expect(await automaticOpeningEnabled()).toBe(true);
    expect(api.permissions.request).not.toHaveBeenCalled();
  });
  it('borne les réglages bloqués', async () => {
    vi.useFakeTimers();
    const api = browser();
    api.storage.local.get.mockImplementation(() => new Promise(() => {}));
    const operation = expect(restoreAutomaticOpening()).rejects.toThrow('(storage.local.get)');
    await vi.advanceTimersByTimeAsync(4001);
    await operation;
  });
  it('désactive et retire aussi la permission des anciennes règles', async () => {
    const api = browser();
    await configureOpening(true);
    await configureOpening(false);
    expect(await automaticOpeningEnabled()).toBe(false);
    expect(api.permissions.remove).toHaveBeenCalledWith({
      permissions: ['webRequest'],
    });
    await openWebPdfResponse(response);
    expect(api.tabs.update).not.toHaveBeenCalled();
  });
  it('reprend un PDF sans suffixe dans son onglet en conservant le fragment', async () => {
    const api = browser();
    await configureOpening(true);
    api.tabs.get.mockResolvedValue({ url: response.url + '#page=2', pendingUrl: undefined });
    await openWebPdfResponse(response);
    expect(api.tabs.update).toHaveBeenCalledWith(12, {
      url: 'chrome-extension://nexus/editor.html#url=' + response.url + '#page=2',
    });
  });
  it('ignore une réponse tardive après navigation ailleurs', async () => {
    const api = browser();
    await configureOpening(true);
    api.tabs.get.mockResolvedValue({ url: response.url, pendingUrl: 'https://example.org/autre' });
    await openWebPdfResponse(response);
    expect(api.tabs.update).not.toHaveBeenCalled();
  });
  it('ignore sous-ressources, HTML, erreurs, POST et pièces jointes', () => {
    expect(isWebPdfResponse(response)).toBe(true);
    expect(
      isWebPdfResponse({
        ...response,
        responseHeaders: [{ name: 'CONTENT-TYPE', value: 'Application/PDF; charset=binary' }],
      }),
    ).toBe(true);
    for (const change of [
      { type: 'sub_frame' as const },
      { type: 'xmlhttprequest' as const },
      { tabId: -1 },
      { method: 'POST' },
      { statusCode: 404 },
      { url: 'file:///test.pdf' },
      { url: 'https://user:secret@example.org/test.pdf' },
      { responseHeaders: [{ name: 'Content-Type', value: 'text/html' }] },
      {
        responseHeaders: [
          ...response.responseHeaders,
          { name: 'Content-Disposition', value: 'attachment; filename=a.pdf' },
        ],
      },
    ])
      expect(isWebPdfResponse({ ...response, ...change })).toBe(false);
  });
  it('préserve l’accès aux fichiers si une autre fonction en a encore besoin', async () => {
    const api = browser([]);
    api.storage.local.get.mockResolvedValue({ automaticFiles: true, automaticDownloads: true });
    await setAutomaticDownloads(false);
    expect(api.permissions.remove).toHaveBeenCalledWith({ permissions: ['downloads'] });
    api.permissions.remove.mockClear();
    await setLocalOpening(false);
    expect(api.permissions.remove).not.toHaveBeenCalled();
  });
  it('reprend uniquement un PDF local autorisé, sans accès aux partages réseau', async () => {
    const api = browser([]);
    api.storage.local.get.mockResolvedValue({ automaticFiles: true });
    await openLocalPdfTab(12, 'file:///C:/Users/Test/rapport%20final.pdf');
    expect(api.tabs.update).toHaveBeenCalledTimes(1);
    api.tabs.update.mockClear();
    await openLocalPdfTab(12, 'file://server/rapport.pdf');
    await openLocalPdfTab(12, 'file:///C:/Users/Test/rapport.txt');
    api.extension.isAllowedFileSchemeAccess.mockResolvedValue(false);
    await openLocalPdfTab(12, 'file:///C:/Users/Test/rapport.pdf');
    expect(api.tabs.update).not.toHaveBeenCalled();
  });
  it('reprend le même onglet et conserve URL, paramètres et fragment', async () => {
    const api = browser([]);
    const url = 'https://example.org/document-pdf?ref=1#page=2';
    await openTabInNexus({ id: 12, url });
    expect(api.permissions.request).toHaveBeenCalledWith({ origins: ['https://example.org/*'] });
    expect(api.tabs.update).toHaveBeenCalledWith(12, {
      url: 'chrome-extension://nexus/editor.html#url=' + url,
    });
  });
  it('ne redirige pas après refus ni depuis une adresse privilégiée', async () => {
    const api = browser([], false);
    await expect(openTabInNexus({ id: 12, url: 'https://example.org/a' })).rejects.toThrow();
    await expect(openTabInNexus({ id: 12, url: 'chrome://settings' })).rejects.toThrow();
    expect(api.tabs.update).not.toHaveBeenCalled();
  });
});
