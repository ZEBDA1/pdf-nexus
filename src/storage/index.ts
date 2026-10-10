import { openDB } from 'idb';
import { defaultPreferences, type Preferences, type ChatMessage, type Source } from '../types';
const db = () =>
  openDB('pdf-nexus', 2, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('recent')) d.createObjectStore('recent', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('chat')) d.createObjectStore('chat');
      if (!d.objectStoreNames.contains('pending')) d.createObjectStore('pending');
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
  const d = await db();
  try {
    return (await d.getAll('recent')).sort((a, b) => b.opened - a.opened);
  } finally {
    d.close();
  }
}
export async function remember(source: Source, pages: number, id: string) {
  const d = await db();
  try {
    await d.put('recent', { ...source, id, pages, size: source.bytes.length, opened: Date.now() });
    const list = ((await d.getAll('recent')) as Recent[]).sort((a, b) => b.opened - a.opened);
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
  const d = await db();
  try {
    return (await d.get('chat', id)) ?? [];
  } finally {
    d.close();
  }
}
export async function saveChat(id: string, m: ChatMessage[]) {
  const d = await db();
  try {
    await d.put('chat', m.slice(-60), id);
  } finally {
    d.close();
  }
}
export async function clearData() {
  const d = await db();
  try {
    await d.clear('recent');
    await d.clear('chat');
    await d.clear('pending');
  } finally {
    d.close();
  }
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
