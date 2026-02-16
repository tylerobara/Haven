/**
 * Haven — End-to-End Encryption for DMs
 *
 * Uses ECDH (P-256) for key agreement + AES-256-GCM for message encryption.
 * Private keys never leave the browser (stored in IndexedDB).
 * The server only stores public keys — it cannot decrypt DM content.
 */

class HavenE2E {
  constructor() {
    this._db = null;          // IndexedDB handle
    this._keyPair = null;     // { publicKey: CryptoKey, privateKey: CryptoKey }
    this._sharedKeys = {};    // targetUserId → AES-GCM CryptoKey (cache)
    this._publicKeyJwk = null; // Our exported public key (JWK)
    this._ready = false;
  }

  /* ── Lifecycle ──────────────────────────────────────── */

  async init() {
    try {
      await this._openDB();
      this._keyPair = await this._loadKeyPair();
      if (!this._keyPair) {
        this._keyPair = await this._generateKeyPair();
        await this._storeKeyPair(this._keyPair);
      }
      this._publicKeyJwk = await crypto.subtle.exportKey('jwk', this._keyPair.publicKey);
      this._ready = true;
      console.log('[E2E] Ready — public key loaded');
    } catch (err) {
      console.error('[E2E] Init failed:', err);
      this._ready = false;
    }
    return this._ready;
  }

  get ready() { return this._ready; }
  get publicKeyJwk() { return this._publicKeyJwk; }

  /* ── Encrypt / Decrypt ─────────────────────────────── */

  /**
   * Encrypt a plaintext message for a DM target.
   * Returns a JSON string: { ct, iv, v } (ciphertext + IV, base64-encoded)
   */
  async encrypt(plaintext, targetUserId, targetPublicKeyJwk) {
    const sharedKey = await this._deriveSharedKey(targetUserId, targetPublicKeyJwk);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      sharedKey,
      encoded
    );
    return JSON.stringify({
      v: 1,
      iv: this._bufToBase64(iv),
      ct: this._bufToBase64(new Uint8Array(ciphertext))
    });
  }

  /**
   * Decrypt a ciphertext (JSON string) from a DM partner.
   * Returns the plaintext string, or null if decryption fails.
   */
  async decrypt(ciphertextJson, partnerUserId, partnerPublicKeyJwk) {
    try {
      const { v, iv, ct } = JSON.parse(ciphertextJson);
      if (v !== 1) return null;
      const sharedKey = await this._deriveSharedKey(partnerUserId, partnerPublicKeyJwk);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this._base64ToBuf(iv) },
        sharedKey,
        this._base64ToBuf(ct)
      );
      return new TextDecoder().decode(decrypted);
    } catch {
      return null;
    }
  }

  /**
   * Check if a string looks like an E2E encrypted message.
   */
  static isEncrypted(content) {
    if (!content || content.length < 20) return false;
    try {
      const obj = JSON.parse(content);
      return obj && obj.v === 1 && obj.iv && obj.ct;
    } catch {
      return false;
    }
  }

  /* ── Key Derivation ───────────────────────────────── */

  async _deriveSharedKey(targetUserId, targetPublicKeyJwk) {
    const cacheKey = `${targetUserId}:${targetPublicKeyJwk.x}`;
    if (this._sharedKeys[cacheKey]) return this._sharedKeys[cacheKey];

    const theirPublicKey = await crypto.subtle.importKey(
      'jwk',
      targetPublicKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    const sharedSecret = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: theirPublicKey },
      this._keyPair.privateKey,
      256
    );

    // HKDF to derive a proper AES key from the shared secret
    const rawKey = await crypto.subtle.importKey(
      'raw',
      sharedSecret,
      'HKDF',
      false,
      ['deriveKey']
    );

    const aesKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode('haven-e2e-dm-v1'),
        info: new TextEncoder().encode('aes-gcm-key')
      },
      rawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    this._sharedKeys[cacheKey] = aesKey;
    return aesKey;
  }

  /* ── Key Pair Management (IndexedDB) ──────────────── */

  async _generateKeyPair() {
    return crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false,   // private key NOT extractable
      ['deriveKey', 'deriveBits']
    );
  }

  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('haven_e2e', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('keys')) {
          db.createObjectStore('keys');
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }

  _storeKeyPair(keyPair) {
    return new Promise((resolve, reject) => {
      const txn = this._db.transaction('keys', 'readwrite');
      const store = txn.objectStore('keys');
      store.put(keyPair.publicKey, 'publicKey');
      store.put(keyPair.privateKey, 'privateKey');
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
    });
  }

  _loadKeyPair() {
    return new Promise((resolve, reject) => {
      const txn = this._db.transaction('keys', 'readonly');
      const store = txn.objectStore('keys');
      const pubReq = store.get('publicKey');
      const privReq = store.get('privateKey');
      txn.oncomplete = () => {
        if (pubReq.result && privReq.result) {
          resolve({ publicKey: pubReq.result, privateKey: privReq.result });
        } else {
          resolve(null);
        }
      };
      txn.onerror = () => reject(txn.error);
    });
  }

  /* ── Helpers ───────────────────────────────────────── */

  _bufToBase64(buf) {
    let binary = '';
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  _base64ToBuf(b64) {
    const binary = atob(b64);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
    return buf;
  }
}

// Singleton
window.HavenE2E = HavenE2E;
