/**
 * AES-GCM 密文格式，与计费配置共用：`v1.<base64-iv>.<base64-ciphertext>`。
 * AAD（context）必须在加解密时一致。
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const SECRET_BOX_VERSION = 'v1';

export function isValidSecretBoxMasterKey(value: string): boolean {
  try {
    return decodeBase64(value).byteLength === 32;
  } catch {
    return false;
  }
}

export async function importSecretBoxMasterKey(encodedMasterKey: string) {
  const bytes = decodeBase64(encodedMasterKey);
  if (bytes.byteLength !== 32) {
    throw new Error(
      'Encryption key must be a Base64-encoded 32-byte key',
    );
  }
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptSecret(
  plaintext: string,
  context: string,
  key: CryptoKey | Promise<CryptoKey>,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: encoder.encode(context),
    },
    await key,
    encoder.encode(plaintext),
  );
  return [SECRET_BOX_VERSION, encodeBase64(iv), encodeBase64(ciphertext)].join(
    '.',
  );
}

export async function decryptSecret(
  value: string,
  context: string,
  key: CryptoKey | Promise<CryptoKey>,
) {
  const [version, encodedIv, encodedCiphertext] = value.split('.');
  if (version !== SECRET_BOX_VERSION || !encodedIv || !encodedCiphertext) {
    throw new Error('Unsupported encrypted secret format');
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: decodeBase64(encodedIv),
      additionalData: encoder.encode(context),
    },
    await key,
    decodeBase64(encodedCiphertext),
  );
  return decoder.decode(plaintext);
}

export function maskSecretHint(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return '••••';
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function encodeBase64(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
