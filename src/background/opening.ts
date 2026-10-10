import { t } from '../i18n';
import { bounded } from '../utils/browser';
import { registerWebOpening } from './webOpening';
export const openingPermissions: chrome.permissions.Permissions = {
  permissions: ['webRequest'],
  origins: ['https://*/*', 'http://*/*'],
};
export async function openingAccessGranted() {
  if (typeof chrome === 'undefined' || !chrome.permissions) return false;
  return bounded(
    chrome.permissions.contains(openingPermissions),
    4000,
    'Chrome ne répond pas à la vérification des autorisations (permissions.contains).',
  );
}
function openingState() {
  return bounded(
    chrome.storage.local.get('automaticOpening'),
    4000,
    'Chrome ne répond pas à la lecture du réglage (storage.local.get).',
  );
}
function saveOpeningState(state: Record<string, unknown>) {
  return bounded(
    chrome.storage.local.set(state),
    4000,
    'Chrome ne répond pas à l’enregistrement du réglage (storage.local.set).',
  );
}
export async function automaticOpeningEnabled() {
  if (!(await openingAccessGranted())) return false;
  if (!(await openingState()).automaticOpening) return false;
  try {
    const status = await bounded(
      chrome.runtime.sendMessage({ type: 'opening-status' }),
      4000,
      'Le service d’ouverture ne répond pas.',
    );
    return status?.ready === true;
  } catch {
    return false;
  }
}
/** Restore only an existing explicit opt-in, never request access in the background. */
export async function restoreAutomaticOpening() {
  const state = await openingState();
  if (state.automaticOpening !== true || !(await openingAccessGranted())) return;
  await configureOpening(true);
}
/** Worker-only: the registered listener must outlive the popup and editor. */
export async function configureOpening(enabled: boolean) {
  if (enabled) {
    if (!(await openingAccessGranted()))
      throw new Error('Autorisez l’accès aux sites pour ouvrir leurs PDF dans Nexus.');
    if (!registerWebOpening())
      throw new Error(
        'La détection des PDF web n’a pas démarré. Rechargez l’extension puis réessayez.',
      );
    await saveOpeningState({
      automaticOpening: true,
      openingRuleMode: 'web-request',
      openingError: '',
    });
  } else {
    await saveOpeningState({ automaticOpening: false, openingError: '' });
    await bounded(
      chrome.permissions.remove({
        permissions: ['webRequest'],
      }),
      4000,
      'Chrome ne répond pas à la désactivation (permissions.remove).',
    );
    if (await openingAccessGranted())
      throw new Error('La désactivation n’a pas abouti. Rechargez l’extension puis réessayez.');
  }
}
export async function setAutomaticOpening(
  enabled: boolean,
  alreadyGranted = false,
  stage: (step: 'permission' | 'rules' | 'repair') => void = () => {},
) {
  if (typeof chrome === 'undefined' || !chrome.permissions)
    throw new Error('Cette option est disponible dans l’extension installée.');
  if (enabled && !alreadyGranted) {
    stage('permission');
    // Keep request() in the original click gesture; record intent without awaiting it.
    const intent = chrome.storage.local.set({ automaticOpening: true, openingError: '' });
    const request = chrome.permissions.request({
      permissions: ['webRequest'],
      origins: ['https://*/*', 'http://*/*'],
    });
    // Some browser surfaces fail to return the permission callback even when
    // access is granted. Observe the effective permission, not only that callback.
    let poll: ReturnType<typeof setInterval> | undefined;
    let checking = false;
    const effectiveGrant = new Promise<boolean>((resolve) => {
      poll = setInterval(() => {
        if (checking) return;
        checking = true;
        void openingAccessGranted()
          .then((granted) => {
            if (granted) resolve(true);
          })
          .catch(() => {})
          .finally(() => {
            checking = false;
          });
      }, 300);
    });
    const [, granted] = await bounded(
      Promise.all([intent, Promise.race([request, effectiveGrant])]),
      60000,
      'La demande d’autorisation n’a pas abouti. Fermez cette page, rouvrez l’activation depuis Nexus et réessayez.',
    )
      .catch(async (error) => {
        await bounded(
          chrome.storage.local.set({ automaticOpening: false }),
          4000,
          'Le navigateur ne répond pas. Rechargez l’extension et rouvrez Nexus.',
        ).catch(() => {});
        throw error;
      })
      .finally(() => clearInterval(poll));
    if (!granted) {
      await saveOpeningState({ automaticOpening: false });
      throw new Error('Autorisation refusée. Cliquez à nouveau pour réessayer.');
    }
  }
  stage('rules');
  const response = await bounded(
    chrome.runtime.sendMessage({ type: 'configure-opening', enabled }),
    10000,
    'Le service d’ouverture ne répond pas. Rechargez l’extension puis réessayez.',
  );
  if (!response?.ok)
    throw new Error(
      response?.error || 'L’activation n’a pas abouti. Rechargez l’extension puis réessayez.',
    );
}
export async function setAutomaticDownloads(enabled: boolean) {
  if (typeof chrome === 'undefined' || !chrome.permissions)
    throw new Error('Cette option est disponible dans l’extension installée.');
  if (
    enabled &&
    !(await chrome.permissions.request({ permissions: ['downloads'], origins: ['file:///*'] }))
  )
    throw new Error('Accès aux téléchargements refusé.');
  await chrome.storage.local.set({ automaticDownloads: enabled });
  if (!enabled) {
    const { automaticFiles } = await chrome.storage.local.get('automaticFiles');
    await chrome.permissions.remove({
      permissions: ['downloads'],
      ...(automaticFiles ? {} : { origins: ['file:///*'] }),
    });
  }
}
export async function setLocalOpening(enabled: boolean) {
  if (typeof chrome === 'undefined' || !chrome.permissions)
    throw new Error('Cette option est disponible dans l’extension installée.');
  if (enabled && !(await chrome.permissions.request({ origins: ['file:///*'] })))
    throw new Error('Accès aux fichiers locaux refusé.');
  await chrome.storage.local.set({ automaticFiles: enabled });
  if (!enabled && !(await chrome.storage.local.get('automaticDownloads')).automaticDownloads)
    await chrome.permissions.remove({ origins: ['file:///*'] });
}
export async function openLocalPdfTab(tabId: number, raw: string) {
  if (!(await chrome.storage.local.get('automaticFiles')).automaticFiles) return;
  const url = new URL(raw);
  if (url.protocol !== 'file:' || url.host || !/\.pdf$/i.test(url.pathname)) return;
  if (
    !(await chrome.permissions.contains({ origins: ['file:///*'] })) ||
    !(await chrome.extension.isAllowedFileSchemeAccess())
  )
    return;
  await chrome.tabs.update(tabId, {
    url: chrome.runtime.getURL('editor.html') + '#url=' + url.href,
  });
}
export async function openTabInNexus(tab: { id?: number; url?: string }) {
  if (tab.id === undefined || !tab.url)
    throw new Error('Aucun PDF web accessible dans cet onglet.');
  const url = new URL(tab.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Ouvrez un lien PDF HTTP(S) pour utiliser cette commande.');
  // Must be invoked from a user gesture. Request only this origin for a one-off import.
  if (!(await chrome.permissions.request({ origins: [url.origin + '/*'] })))
    throw new Error('Accès au site refusé.');
  await chrome.tabs.update(tab.id, {
    url: chrome.runtime.getURL('editor.html') + '#url=' + url.href,
  });
}
export async function fetchPdfUrl(raw: string, signal: AbortSignal) {
  const url = new URL(raw);
  const local = url.protocol === 'file:' && !url.host && /\.pdf$/i.test(url.pathname);
  if ((!['https:', 'http:'].includes(url.protocol) && !local) || url.username || url.password)
    throw new Error('Adresse PDF non autorisée.');
  if (
    typeof chrome === 'undefined' ||
    !chrome.permissions ||
    !(await chrome.permissions.contains({ origins: [local ? 'file:///*' : url.origin + '/*'] }))
  )
    throw new Error(
      'Activez l’ouverture des PDF web dans les paramètres, ou téléchargez le fichier et ouvrez-le manuellement.',
    );
  if (local && !(await chrome.extension.isAllowedFileSchemeAccess()))
    throw new Error(
      'Activez « Autoriser l’accès aux URL de fichiers » dans les détails de PDF Nexus.',
    );
  const response = await fetch(url.href, {
    signal,
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  });
  if ((!response.ok && !(local && response.status === 0)) || !response.body)
    throw new Error(
      t(
        'Impossible d’ouvrir ce PDF ({status}). Téléchargez-le puis ouvrez-le manuellement s’il nécessite une connexion.',
        { status: response.status },
      ),
    );
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 150 * 1024 * 1024) throw new Error('PDF trop volumineux : maximum 150 Mio.');
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel();
    throw e;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-'))
    throw new Error('La ressource reçue n’est pas un fichier PDF.');
  let name = url.pathname.split('/').pop() || 'document.pdf';
  try {
    name = decodeURIComponent(name);
  } catch {
    /* Keep the literal name for malformed escapes. */
  }
  if (!/\.pdf$/i.test(name)) name += '.pdf';
  return { name, bytes };
}
