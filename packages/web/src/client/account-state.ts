import { type AccountError } from '@gsainfoteam/account-core';

/** client 가 세션 복구를 시도하기 전까지는 `loading` 이다. */
export type AccountStatus = 'loading' | 'authenticated' | 'unauthenticated';

/** client 의 상태 스냅샷. React 와 다른 프레임워크가 구독할 수 있게 zustand store 에 둔다. */
export interface AccountState {
  status: AccountStatus;
  /** 서비스 백엔드의 access token. 메모리에만 두고, 새로고침하면 세션 refresh 로 복구한다. */
  accessToken: string | null;
  /** 마지막 로그인이나 refresh 가 실패한 이유. */
  error: AccountError | null;
  /** 서비스 백엔드가 로그인을 거절했고, {@link AccountClient.retryLogin} 으로 같은 사용자의 로그인을 이어 갈 수 있다. */
  canRetryLogin: boolean;
}
