import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
  doc,
  getDocFromServer,
  Firestore
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Silence noisy internal @firebase/firestore WebChannel retry logs when operating with offline cache
try {
  setLogLevel('silent');
} catch {
  // Ignore if setLogLevel is unavailable
}

// CRITICAL: Must pass firestoreDatabaseId, enable IndexedDB local cache, and auto-detect long polling for iframe/mobile networks
function initDb(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
        experimentalAutoDetectLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = initDb();
export const auth = getAuth(app);
export const storage = getStorage(app);

// Validate Connection to Firestore on boot
export async function testConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore operating in offline cache mode until connection is restored.');
      return false;
    }
    // Document might not exist yet or rules blocked test doc, which means connection to backend succeeded
    return true;
  }
}

setTimeout(() => {
  testConnection().catch(() => {});
}, 1500);

export default app;

