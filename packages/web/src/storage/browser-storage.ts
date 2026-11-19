import { STORAGE_NAMESPACE } from '@infoteam/account-core';
import { attempt } from 'es-toolkit';

const PROBE = `${STORAGE_NAMESPACE}:probe`;

/**
 * 쿠키와 사이트 데이터를 막은 브라우저나 sandbox iframe에서는 storage에 접근만 해도 `SecurityError`가 난다. 그때는
 * 메모리에 둬서, 새로고침하면 잊더라도 로그인 자체는 되게 한다.
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

function memoryStorage(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, String(value)),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
}
