import * as z from 'zod/mini';

/**
 * 사용자 정보에 접근하게 해 주는 scope.
 *
 * @remarks
 * `pnpm sync:scopes` 가 production IdP 의 `scopes_supported` 에서 생성한다. 손으로 고치지 않는다.
 * account-be 에 scope 가 추가되거나 빠지면 스크립트를 다시 돌리고 SDK 를 배포한다.
 */
export const ClientScopeSchema = z.enum([
  'profile',
  'name',
  'picture',
  'email',
  'phone_number',
  'student_id',
]);
