import crypto from 'crypto';
import Store from 'electron-store';

const store = new Store();

// Simulate the encryption key logic
let ENCRYPTION_KEY = null;
const ENCRYPTION_IV_LENGTH = 16;

function getEncryptionKey() {
  if (!ENCRYPTION_KEY) {
    const storedKey = store.get('encryptionKey');
    if (storedKey) {
      ENCRYPTION_KEY = Buffer.from(storedKey, 'hex');
      console.log('Loaded existing key from store');
    } else {
      ENCRYPTION_KEY = crypto.randomBytes(32);
      store.set('encryptionKey', ENCRYPTION_KEY.toString('hex'));
      console.log('Generated new key and saved to store');
    }
  }
  return ENCRYPTION_KEY;
}

function encrypt(text) {
  if (!text) return undefined;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  if (!text) return undefined;
  try {
    const key = getEncryptionKey();
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decrypt failed:', err.message);
    return undefined;
  }
}

// Test
console.log('\n=== Testing Encryption ===');
const testPassword = 'mySecretPassword123';
console.log('Original:', testPassword);

const encrypted = encrypt(testPassword);
console.log('Encrypted:', encrypted);

const decrypted = decrypt(encrypted);
console.log('Decrypted:', decrypted);
console.log('Match:', testPassword === decrypted);

// Check what's in store
console.log('\n=== Checking Store ===');
const connections = store.get('sshConnections', []);
console.log('Stored connections:', connections.length);
connections.forEach((conn, i) => {
  console.log(`\nConnection ${i}:`, {
    id: conn.id,
    name: conn.name,
    hasCredentials: !!conn.credentials,
    credentialsKeys: conn.credentials ? Object.keys(conn.credentials) : []
  });
  
  if (conn.credentials?.password) {
    console.log('Encrypted password:', conn.credentials.password.substring(0, 50) + '...');
    const decrypted = decrypt(conn.credentials.password);
    console.log('Decryption result:', decrypted ? 'SUCCESS' : 'FAILED');
  }
});

