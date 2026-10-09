import * as z from 'zod/mini';

/**
 * Scopes that grant access to user information.
 *
 * @remarks
 * Generated from the production IdP's `scopes_supported` by `pnpm sync:scopes`. Do not edit by hand:
 * when account-be adds or removes a scope, run the script again and release the SDK.
 */
export const ClientScopeSchema = z.enum([
  'profile',
  'name',
  'picture',
  'email',
  'phone_number',
  'student_id',
]);
