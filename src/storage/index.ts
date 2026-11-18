import { openDB } from 'idb';
import { defaultPreferences, type Preferences, type ChatMessage, type Source } from '../types';
import {
  clearVaultConfig,
  decryptFromVault,
  encryptForVault,
  isEncryptedEnvelope,
  isVaultEnabled,
  isVaultUnlocked,
} from './vault';
export const db = () =>
  openDB('pdf-nexus', 3, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('recent')) d.createObjectStore('recent', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('chat')) d.createObjectStore('chat');
      if (!d.objectStoreNames.contains('pending')) d.createObjectStore('pending');
      if (!d.objectStoreNames.contains('drafts')) d.createObjectStore('drafts', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('draftStates')) d.createObjectStore('draftStates');
      if (!d.objectStoreNames.contains('draftSources')) d.createObjectStore('draftSources');
    },
  });
export interface Recent {
  id: string;
  name: string;
  bytes: Uint8Array;
  size: number;
  opened: number;
  pages: number;
}
export function canPersist(p: Preferences): boolean {
  return p.storageConsent === 'accepted';
}
export async function getPreferences(): Promise<Preferences> {
  const data =
    typeof chrome !== 'undefined' && chrome.storage
      ? (await chrome.storage.local.get('preferences')).preferences
      : JSON.parse(localStorage.getItem('nexus-preferences') ?? 'null');
  return { ...defaultPreferences, ...data };
}
export async function savePreferences(p: Preferences) {
  if (typeof chrome !== 'undefined' && chrome.storage)
    await chrome.storage.local.set({ preferences: p });
  else localStorage.setItem('nexus-preferences', JSON.stringify(p));
}
export async function listRecent(): Promise<Recent[]> {
  if ((await isVaultEnabled()) && !isVaultUnlocked()) return [];
  const d = await db();
  try {
    const raw = (await d.getAll('recent')) as Array<
      Record<string, unknown> & { id: string; size: number; opened: number; pages: number }
    >;
    const list: Recent[] = [];
    for (const r of raw) {
      if (isEncryptedEnvelope(r.payload)) {
        const dec = await decryptFromVault<{ name: string; bytes: Uint8Array }>(r.payload);
        list.push({
          id: r.id,
          name: dec.name,
          bytes: dec.bytes,
          size: r.size,
          opened: r.opened,
          pages: r.pages,
        });
      } else {
        list.push(r as unknown as Recent);
      }
    }
    return list.sort((a, b) => b.opened - a.opened);
  } finally {
    d.close();
  }
}
export async function remember(source: Source, pages: number, id: string) {
  const vault = await isVaultEnabled();
  if (vault && !isVaultUnlocked())
    throw new Error('Le coffre local est verrouillé. Déverrouillez-le pour enregistrer.');
  const payload = vault
    ? await encryptForVault({ name: source.name, bytes: source.bytes })
    : undefined;
  const d = await db();
  try {
    await d.put(
      'recent',
      vault
        ? { id, size: source.bytes.length, opened: Date.now(), pages, payload }
        : { ...source, id, pages, size: source.bytes.length, opened: Date.now() },
    );
    const list = (
      (await d.getAll('recent')) as Array<{ id: string; size: number; opened: number }>
    ).sort((a, b) => b.opened - a.opened);
    let total = 0;
    for (let i = 0; i < list.length; i++) {
      total += list[i].size;
      if (i >= 10 || total > 100 * 1024 * 1024) await d.delete('recent', list[i].id);
    }
  } finally {
    d.close();
  }
}
export async function removeRecent(id: string) {
  const d = await db();
  try {
    await d.delete('recent', id);
    await d.delete('chat', id);
  } finally {
    d.close();
  }
}
export async function getChat(id: string): Promise<ChatMessage[]> {
  if ((await isVaultEnabled()) && !isVaultUnlocked()) return [];
  const d = await db();
  try {
    const value = await d.get('chat', id);
    if (isEncryptedEnvelope(value)) return await decryptFromVault<ChatMessage[]>(value);
    return (value as ChatMessage[]) ?? [];
  } finally {
    d.close();
  }
}
export async function saveChat(id: string, m: ChatMessage[]) {
  const vault = await isVaultEnabled();
  if (vault && !isVaultUnlocked())
    throw new Error('Le coffre local est verrouillé. Déverrouillez-le pour enregistrer.');
  const sliced = m.slice(-60);
  const stored = vault ? await encryptForVault(sliced) : sliced;
  const d = await db();
  try {
    await d.put('chat', stored, id);
  } finally {
    d.close();
  }
}
export async function deleteChat(id: string) {
  const d = await db();
  try {
    await d.delete('chat', id);
  } finally {
    d.close();
  }
}
export async function clearData() {
  const { clearDrafts } = await import('./drafts');
  await clearDrafts();
  const d = await db();
  try {
    await d.clear('recent');
    await d.clear('chat');
    await d.clear('pending');
  } finally {
    d.close();
  }
  await clearVaultConfig();
  await setKey('');
}
let memoryKey = '';
export async function setKey(key: string) {
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    if (key) await chrome.storage.session.set({ aiKey: key });
    else await chrome.storage.session.remove('aiKey');
  } else memoryKey = key;
}
export async function getKey(): Promise<string> {
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    const value = (await chrome.storage.session.get('aiKey')).aiKey;
    return typeof value === 'string' ? value : '';
  }
  return memoryKey;
}
export async function documentId(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function stageFile(source: Source) {
  const d = await db(),
    id = crypto.randomUUID();
  try {
    // A popup hands a single local file to the editor, independently of recent-file preferences.
    await d.clear('pending');
    await d.put('pending', { source, created: Date.now() }, id);
    return id;
  } finally {
    d.close();
  }
}
export async function takeStagedFile(id: string): Promise<Source> {
  const d = await db();
  try {
    const value = await d.get('pending', id);
    await d.delete('pending', id);
    if (!value || Date.now() - value.created > 3600000)
      throw new Error('Ce fichier temporaire a expiré. Ouvrez-le à nouveau.');
    return value.source;
  } finally {
    d.close();
  }
}
