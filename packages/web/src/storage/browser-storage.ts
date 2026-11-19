import { STORAGE_NAMESPACE } from '@infoteam/account-core';
import { attempt } from 'es-toolkit';

const PROBE = `${STORAGE_NAMESPACE}:probe`;

const MEMORY = new WeakSet<Storage>();

export function browserStorage(name: 'localStorage' | 'sessionStorage'): Storage {
  const [, storage] = attempt(() => {
    const candidate = globalThis[name];
    candidate.setItem(PROBE, PROBE);
    candidate.removeItem(PROBE);
    return candidate;
  });

  return storage ?? memoryStorage();
}

export function isMemoryStorage(storage: Storage): boolean {
  return MEMORY.has(storage);
}

function memoryStorage(): Storage {
  const items = new Map<string, string>();

  const storage: Storage = {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, String(value)),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
  MEMORY.add(storage);
  return storage;
}
