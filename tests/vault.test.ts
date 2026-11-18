import { describe, expect, it } from 'vitest';
import { decryptWithKey, encryptWithKey, isEncryptedEnvelope } from '../src/storage/vault';
import { canPersist } from '../src/storage';
import { defaultPreferences } from '../src/types';

async function deriveTestKey(passphrase: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey(
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
      iterations: 10_000,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

describe('vault & storage consent', () => {
  it('refuse la persistance tant que le consentement explicite n’est pas accordé', () => {
    expect(canPersist(defaultPreferences)).toBe(false);
    expect(canPersist({ ...defaultPreferences, storageConsent: 'declined' })).toBe(false);
    expect(canPersist({ ...defaultPreferences, storageConsent: 'accepted' })).toBe(true);
  });

  it('chiffre et déchiffre objets et tampons binaires Uint8Array avec AES-GCM', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveTestKey('phrase-secrete-nexus', salt);
    const payload = {
      name: 'contrat.pdf',
      pages: 3,
      bytes: new Uint8Array([37, 80, 68, 70, 0, 255, 128]),
      nested: { ok: true, items: ['a', 'b'] },
    };

    const envelope = await encryptWithKey(key, payload);
    expect(isEncryptedEnvelope(envelope)).toBe(true);
    expect(isEncryptedEnvelope(payload)).toBe(false);

    const decoded = await decryptWithKey<typeof payload>(key, envelope);
    expect(decoded.name).toBe('contrat.pdf');
    expect(decoded.pages).toBe(3);
    expect(decoded.nested).toEqual({ ok: true, items: ['a', 'b'] });
    expect(decoded.bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(decoded.bytes)).toEqual([37, 80, 68, 70, 0, 255, 128]);
  });

  it('rejette le déchiffrement avec une mauvaise clé', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const goodKey = await deriveTestKey('bonne-phrase', salt);
    const badKey = await deriveTestKey('mauvaise-phrase', salt);
    const envelope = await encryptWithKey(goodKey, { secret: 'confidentiel' });
    await expect(decryptWithKey(badKey, envelope)).rejects.toBeTruthy();
  });
});
