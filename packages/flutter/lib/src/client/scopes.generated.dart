/// Scopes the IdP accepts, except `openid`.
///
/// This package does not verify id_tokens, so it does not ask for one.
///
/// Generated from the production IdP's `scopes_supported` by `pnpm sync:scopes`. Do not edit by
/// hand: when account-be adds or removes a scope, run the script again and release the package.
enum AccountScope {
  profile('profile'),
  name('name'),
  picture('picture'),
  email('email'),
  phoneNumber('phone_number'),
  studentId('student_id'),
  offlineAccess('offline_access');

  const AccountScope(this.value);

  /// The scope as sent to the IdP.
  final String value;
}
