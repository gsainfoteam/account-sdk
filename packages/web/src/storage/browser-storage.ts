import { STORAGE_NAMESPACE } from '@infoteam/account-core';
import { attempt } from 'es-toolkit';

const PROBE = `${STORAGE_NAMESPACE}:probe`;

const MEMORY = new WeakSet<Storage>();

/**
 * 쿠키와 사이트 데이터를 막은 브라우저나 sandbox iframe에서는 storage에 접근만 해도 `SecurityError`가 난다. 그때는
 * 메모리에 둬서 client가 만들어지고 세션도 복구되게 한다.
 */
export function browserStorage(name: 'localStorage' | 'sessionStorage'): Storage {
  const [, storage] = attempt(() => {
    const candidate = globalThis[name];
    candidate.setItem(PROBE, PROBE);
    candidate.removeItem(PROBE);
    return candidate;
  });

  return storage ?? memoryStorage();
}

/** 페이지를 떠나면 잊는 storage다. 여기에 둔 로그인 진행 정보는 IdP에서 돌아왔을 때 남아 있지 않다. */
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
