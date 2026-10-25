// IndexedDB storage for VRM Avatar Catalog (Local-first persistence)
export interface StoredAvatar {
  id: string;
  name: string;
  type: 'default' | 'preset' | 'custom';
  description: string;
  tagline: string;
  sizeFormatted: string;
  importedAt: string;
  blob?: Blob;
  previewColor: string;
  modelUrl?: string;
}

const DB_NAME = 'LocalCore_VRM_Catalog';
const DB_VERSION = 1;
const STORE_NAME = 'avatars';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Built-in starter avatars
export const DEFAULT_AVATARS: StoredAvatar[] = [
  {
    id: 'default-aria',
    name: 'Aria (Default Anime Companion)',
    type: 'default',
    description: 'Full-body anime female companion with academy blazer, pleated skirt, dynamic hair ribbons, and 12-mood expressions.',
    tagline: 'Built-in 3D Humanoid',
    sizeFormatted: 'Built-in (Zero Download)',
    importedAt: 'Core System',
    previewColor: 'from-pink-500 to-rose-600',
  },
  {
    id: 'preset-sample-vrm',
    name: 'Pixiv VRM Sample Model',
    type: 'preset',
    description: 'Official VRM 1.0 sample avatar from the @pixiv/three-vrm test suite with spring bones and blendshapes.',
    tagline: 'Official VRM 1.0 Sample',
    sizeFormatted: '~4.2 MB',
    importedAt: 'Preset Library',
    previewColor: 'from-cyan-500 to-blue-600',
    modelUrl: 'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@release/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm'
  }
];

export async function getAllCatalogAvatars(): Promise<StoredAvatar[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const customAvatars = req.result || [];
        resolve([...DEFAULT_AVATARS, ...customAvatars]);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB unavailable, falling back to default presets:', e);
    return DEFAULT_AVATARS;
  }
}

export async function saveCustomVrmAvatar(name: string, blob: Blob): Promise<StoredAvatar> {
  const db = await openDatabase();
  const id = `vrm-user-${Date.now()}`;
  const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);

  const colors = [
    'from-purple-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-fuchsia-500 to-pink-600',
    'from-cyan-500 to-teal-600'
  ];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const cleanName = name.replace(/\.(vrm|glb)$/i, '');

  const avatarRecord: StoredAvatar = {
    id,
    name: cleanName,
    type: 'custom',
    description: `User-imported VRM 3D avatar (${name}). Rigged humanoid with bones, expressions & lip-sync.`,
    tagline: 'Custom Imported VRM',
    sizeFormatted: `${sizeMB} MB`,
    importedAt: new Date().toLocaleDateString(),
    blob,
    previewColor: color
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(avatarRecord);

    req.onsuccess = () => resolve(avatarRecord);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteCustomVrmAvatar(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
