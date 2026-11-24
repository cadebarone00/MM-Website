/**
 * The iPhone Keychain (expo-secure-store) only promises ~2 KB per value, and a Supabase login is bigger than that.
 * This splits one value across "<key>.0", "<key>.1", … plus "<key>.count", and puts it back together on read.
 * A missing piece reads as null (signed out) rather than a broken login.
 */
export interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createChunkedStorage(store: KeyValueStore, chunkSize = 1800): AsyncStorageLike {
  const countKey = (key: string) => `${key}.count`;
  const chunkKey = (key: string, index: number) => `${key}.${index}`;

  async function savedCount(key: string): Promise<number> {
    const count = Number(await store.getItemAsync(countKey(key)));
    return Number.isInteger(count) && count > 0 ? count : 0;
  }

  async function removeItem(key: string): Promise<void> {
    const count = await savedCount(key);
    for (let index = 0; index < count; index++) await store.deleteItemAsync(chunkKey(key, index));
    await store.deleteItemAsync(countKey(key));
  }

  return {
    async getItem(key) {
      const count = await savedCount(key);
      if (count === 0) return null;
      const parts: string[] = [];
      for (let index = 0; index < count; index++) {
        const part = await store.getItemAsync(chunkKey(key, index));
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join("");
    },
    async setItem(key, value) {
      await removeItem(key);
      const count = Math.max(1, Math.ceil(value.length / chunkSize));
      for (let index = 0; index < count; index++) {
        await store.setItemAsync(chunkKey(key, index), value.slice(index * chunkSize, (index + 1) * chunkSize));
      }
      await store.setItemAsync(countKey(key), String(count));
    },
    removeItem,
  };
}
