import { openDB } from 'idb';

export interface VaultConfig {
  salt: string;
  checkIv: string;
  checkData: string;
}

export interface EncryptedEnvelope {
  __nexusVault: 1;
  iv: Uint8Array;
  data: Uint8Array;
}

const SENTINEL = 'PDF-NEXUS-VAULT-V1';
const ITERATIONS = 210_000;
const STORAGE_KEY = 'vaultConfig';
const LOCAL_KEY = 'nexus-vault-config';

let vaultKey: CryptoKey | null = null;

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 32768)
    out += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(out);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as EncryptedEnvelope).__nexusVault === 1 &&
    (value as EncryptedEnvelope).iv instanceof Uint8Array &&
    (value as EncryptedEnvelope).data instanceof Uint8Array
  );
}

function packValue(value: unknown): Uint8Array {
  const buffers: Uint8Array[] = [];
  const json = JSON.stringify(value, (_key, item) => {
    if (item instanceof Uint8Array) {
      const index = buffers.length;
      buffers.push(item);
      return { __nexusU8: index };
    }
    return item;
  });
  const jsonBytes = new TextEncoder().encode(json);
  const total = 4 + jsonBytes.length + buffers.reduce((sum, b) => sum + 4 + b.byteLength, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, jsonBytes.length);
  out.set(jsonBytes, 4);
  let offset = 4 + jsonBytes.length;
  for (const buf of buffers) {
    view.setUint32(offset, buf.byteLength);
    out.set(buf, offset + 4);
    offset += 4 + buf.byteLength;
  }
  return out;
}

function unpackValue<T>(packed: Uint8Array): T {
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
  const jsonLen = view.getUint32(0);
  const json = new TextDecoder().decode(packed.subarray(4, 4 + jsonLen));
  const buffers: Uint8Array[] = [];
  let offset = 4 + jsonLen;
  while (offset < packed.byteLength) {
    const len = view.getUint32(offset);
    buffers.push(packed.slice(offset + 4, offset + 4 + len));
    offset += 4 + len;
  }
  return JSON.parse(json, (_key, item) => {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as { __nexusU8?: unknown }).__nexusU8 === 'number'
    ) {
      return buffers[(item as { __nexusU8: number }).__nexusU8];
    }
    return item;
  }) as T;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.slice().buffer as ArrayBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptWithKey(key: CryptoKey, value: unknown): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const packed = packValue(value);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.slice().buffer as ArrayBuffer },
    key,
    packed.slice().buffer as ArrayBuffer,
  );
  return { __nexusVault: 1, iv, data: new Uint8Array(encrypted) };
}

export async function decryptWithKey<T>(key: CryptoKey, envelope: EncryptedEnvelope): Promise<T> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: envelope.iv.slice().buffer as ArrayBuffer },
    key,
    envelope.data.slice().buffer as ArrayBuffer,
  );
  return unpackValue<T>(new Uint8Array(decrypted));
}

export async function getVaultConfig(): Promise<VaultConfig | null> {
  const raw =
    typeof chrome !== 'undefined' && chrome.storage?.local
      ? (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]
      : JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null');
  if (
    raw &&
    typeof raw === 'object' &&
    typeof raw.salt === 'string' &&
    typeof raw.checkIv === 'string' &&
    typeof raw.checkData === 'string'
  )
    return raw as VaultConfig;
  return null;
}

async function saveVaultConfig(config: VaultConfig | null) {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    if (config) await chrome.storage.local.set({ [STORAGE_KEY]: config });
    else await chrome.storage.local.remove(STORAGE_KEY);
  } else {
    if (config) localStorage.setItem(LOCAL_KEY, JSON.stringify(config));
    else localStorage.removeItem(LOCAL_KEY);
  }
}

export const isVaultUnlocked = () => vaultKey !== null;

export async function isVaultEnabled() {
  return (await getVaultConfig()) !== null;
}

export function lockVault() {
  vaultKey = null;
}

export async function clearVaultConfig() {
  vaultKey = null;
  await saveVaultConfig(null);
}

export async function encryptForVault(value: unknown): Promise<EncryptedEnvelope> {
  if (!vaultKey)
    throw new Error('Le coffre local est verrouillé. Déverrouillez-le pour enregistrer.');
  return encryptWithKey(vaultKey, value);
}

export async function decryptFromVault<T>(envelope: EncryptedEnvelope): Promise<T> {
  if (!vaultKey)
    throw new Error('Le coffre local est verrouillé. Déverrouillez-le pour lire ces données.');
  return decryptWithKey<T>(vaultKey, envelope);
}

function vaultDb() {
  return openDB('pdf-nexus', 3, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('recent')) d.createObjectStore('recent', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('chat')) d.createObjectStore('chat');
      if (!d.objectStoreNames.contains('pending')) d.createObjectStore('pending');
      if (!d.objectStoreNames.contains('drafts')) d.createObjectStore('drafts', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('draftStates')) d.createObjectStore('draftStates');
      if (!d.objectStoreNames.contains('draftSources')) d.createObjectStore('draftSources');
    },
  });
}

async function migrateExisting(mode: 'encrypt' | 'decrypt', key: CryptoKey): Promise<void> {
  const d = await vaultDb();
  try {
    const rTx = d.transaction(
      ['recent', 'chat', 'drafts', 'draftStates', 'draftSources'],
      'readonly',
    );
    const [recents, chatKeys, chatVals, drafts, stateKeys, stateVals, sourceKeys, sourceVals] =
      await Promise.all([
        rTx.objectStore('recent').getAll(),
        rTx.objectStore('chat').getAllKeys(),
        rTx.objectStore('chat').getAll(),
        rTx.objectStore('drafts').getAll(),
        rTx.objectStore('draftStates').getAllKeys(),
        rTx.objectStore('draftStates').getAll(),
        rTx.objectStore('draftSources').getAllKeys(),
        rTx.objectStore('draftSources').getAll(),
      ]);
    await rTx.done;

    const nextRecents = await Promise.all(
      recents.map(async (r: Record<string, unknown>) => {
        if (mode === 'encrypt') {
          if (isEncryptedEnvelope(r.payload)) return r;
          return {
            id: r.id,
            size: r.size,
            opened: r.opened,
            pages: r.pages,
            payload: await encryptWithKey(key, { name: r.name, bytes: r.bytes }),
          };
        }
        if (!isEncryptedEnvelope(r.payload)) return r;
        const dec = await decryptWithKey<{ name: string; bytes: Uint8Array }>(key, r.payload);
        return {
          id: r.id,
          name: dec.name,
          bytes: dec.bytes,
          size: r.size,
          opened: r.opened,
          pages: r.pages,
        };
      }),
    );

    const nextChats = await Promise.all(
      chatVals.map(async (v: unknown, i: number) => {
        if (mode === 'encrypt') {
          return {
            key: chatKeys[i],
            val: isEncryptedEnvelope(v) ? v : await encryptWithKey(key, v),
          };
        }
        return {
          key: chatKeys[i],
          val: isEncryptedEnvelope(v) ? await decryptWithKey(key, v) : v,
        };
      }),
    );

    const nextDrafts = await Promise.all(
      drafts.map(async (info: Record<string, unknown>) => {
        if (mode === 'encrypt') {
          if (isEncryptedEnvelope(info.encryptedName)) return info;
          return {
            id: info.id,
            name: 'Document chiffré',
            encryptedName: await encryptWithKey(key, info.name),
            updated: info.updated,
            pages: info.pages,
            size: info.size,
          };
        }
        if (!isEncryptedEnvelope(info.encryptedName)) return info;
        return {
          id: info.id,
          name: await decryptWithKey<string>(key, info.encryptedName),
          updated: info.updated,
          pages: info.pages,
          size: info.size,
        };
      }),
    );

    const nextStates = await Promise.all(
      stateVals.map(async (v: unknown, i: number) => ({
        key: stateKeys[i],
        val:
          mode === 'encrypt'
            ? isEncryptedEnvelope(v)
              ? v
              : await encryptWithKey(key, v)
            : isEncryptedEnvelope(v)
              ? await decryptWithKey(key, v)
              : v,
      })),
    );

    const nextSources = await Promise.all(
      sourceVals.map(async (v: Record<string, unknown>, i: number) => {
        if (mode === 'encrypt') {
          if (isEncryptedEnvelope(v?.encrypted)) return { key: sourceKeys[i], val: v };
          return {
            key: sourceKeys[i],
            val: {
              revision: v.revision,
              encrypted: await encryptWithKey(key, v.sources),
            },
          };
        }
        if (!isEncryptedEnvelope(v?.encrypted)) return { key: sourceKeys[i], val: v };
        return {
          key: sourceKeys[i],
          val: {
            revision: v.revision,
            sources: await decryptWithKey(key, v.encrypted),
          },
        };
      }),
    );

    const wTx = d.transaction(
      ['recent', 'chat', 'drafts', 'draftStates', 'draftSources'],
      'readwrite',
    );
    for (const r of nextRecents) await wTx.objectStore('recent').put(r);
    for (const c of nextChats) await wTx.objectStore('chat').put(c.val, c.key);
    for (const info of nextDrafts) await wTx.objectStore('drafts').put(info);
    for (const s of nextStates) await wTx.objectStore('draftStates').put(s.val, s.key);
    for (const src of nextSources) await wTx.objectStore('draftSources').put(src.val, src.key);
    await wTx.done;
  } finally {
    d.close();
  }
}

export async function setupVault(passphrase: string): Promise<void> {
  if (passphrase.length < 4)
    throw new Error('La phrase secrète doit contenir au moins 4 caractères.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const check = await encryptWithKey(key, SENTINEL);
  await migrateExisting('encrypt', key);
  await saveVaultConfig({
    salt: toBase64(salt),
    checkIv: toBase64(check.iv),
    checkData: toBase64(check.data),
  });
  vaultKey = key;
}

export async function unlockVault(passphrase: string): Promise<void> {
  const config = await getVaultConfig();
  if (!config) return;
  const key = await deriveKey(passphrase, fromBase64(config.salt));
  try {
    const value = await decryptWithKey<string>(key, {
      __nexusVault: 1,
      iv: fromBase64(config.checkIv),
      data: fromBase64(config.checkData),
    });
    if (value !== SENTINEL) throw new Error('Invalid');
  } catch {
    throw new Error('Phrase secrète incorrecte.');
  }
  vaultKey = key;
}

export async function disableVault(passphrase?: string): Promise<void> {
  const config = await getVaultConfig();
  if (!config) {
    vaultKey = null;
    return;
  }
  if (!vaultKey) {
    if (!passphrase)
      throw new Error('Saisissez la phrase secrète pour déchiffrer et désactiver le coffre.');
    await unlockVault(passphrase);
  }
  await migrateExisting('decrypt', vaultKey!);
  await clearVaultConfig();
}
