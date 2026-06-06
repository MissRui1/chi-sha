const DB_NAME = "chi-sha-local";
const DB_VERSION = 1;
const STORE_NAME = "mealPhotos";

type StoredPhoto = {
  id: string;
  dataUrl: string;
  createdAt: string;
  userId?: string;
};

const canUseIndexedDb = () =>
  typeof window !== "undefined" &&
  typeof indexedDB !== "undefined";

const openPhotoDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Open IndexedDB failed"));
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
) => {
  const db = await openPhotoDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(
        transaction.error ??
          new Error("IndexedDB transaction failed")
      );
    };
  });
};

export const createMealPhotoId = (userId = "anon") =>
  `meal_photo_${encodeURIComponent(userId)}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export async function saveMealPhoto(
  dataUrl: string,
  userId?: string
): Promise<string | null> {
  if (!canUseIndexedDb()) {
    return null;
  }

  const id = createMealPhotoId(userId);
  const photo: StoredPhoto = {
    id,
    dataUrl,
    createdAt: new Date().toISOString(),
    userId,
  };

  await withStore("readwrite", (store) => store.put(photo));

  return id;
}

export async function readMealPhoto(
  id?: string,
  userId?: string
): Promise<string | undefined> {
  if (!id || !canUseIndexedDb()) {
    return undefined;
  }

  const photo = await withStore<StoredPhoto | undefined>(
    "readonly",
    (store) => store.get(id)
  );

  if (!photo) {
    return undefined;
  }

  if (userId && photo.userId && photo.userId !== userId) {
    return undefined;
  }

  return photo.dataUrl;
}
