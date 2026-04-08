const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('crypto');

const ENCRYPTION_PREFIX = 'enc:v1:';
const ENCRYPTION_KEY = createHash('sha256')
  .update('relay-pulse::built-in-secret::v1')
  .digest();

function isEncryptedSecret(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}

function encryptSecret(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const plainText = value;
  if (!plainText) {
    return '';
  }

  if (isEncryptedSecret(plainText)) {
    return plainText;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${Buffer.concat([iv, authTag, encrypted]).toString('base64')}`;
}

function decryptSecret(value) {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  if (!isEncryptedSecret(value)) {
    return value;
  }

  try {
    const payload = Buffer.from(value.slice(ENCRYPTION_PREFIX.length), 'base64');
    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch (_error) {
    return '';
  }
}

function encryptApiSecrets(api) {
  return {
    ...api,
    apiKey: encryptSecret(api?.apiKey),
    accountPassword: encryptSecret(api?.accountPassword),
  };
}

function decryptApiSecrets(api) {
  return {
    ...api,
    apiKey: decryptSecret(api?.apiKey),
    accountPassword: decryptSecret(api?.accountPassword),
  };
}

function encryptGistSyncSecrets(gistSync) {
  return {
    ...gistSync,
    token: encryptSecret(gistSync?.token),
  };
}

function decryptGistSyncSecrets(gistSync) {
  return {
    ...gistSync,
    token: decryptSecret(gistSync?.token),
  };
}

function hasLegacyPlaintextSecrets(parsed) {
  const hasPlainApiSecret = Array.isArray(parsed?.apis) && parsed.apis.some(
    api => (typeof api?.apiKey === 'string' && api.apiKey && !isEncryptedSecret(api.apiKey))
      || (typeof api?.accountPassword === 'string' && api.accountPassword && !isEncryptedSecret(api.accountPassword)),
  );

  const hasPlainGistToken = typeof parsed?.gistSync?.token === 'string'
    && parsed.gistSync.token
    && !isEncryptedSecret(parsed.gistSync.token);

  return hasPlainApiSecret || hasPlainGistToken;
}

module.exports = {
  decryptApiSecrets,
  decryptGistSyncSecrets,
  decryptSecret,
  encryptApiSecrets,
  encryptGistSyncSecrets,
  encryptSecret,
  hasLegacyPlaintextSecrets,
  isEncryptedSecret,
};
