/// Scopes the IdP accepts, except `openid`.
///
/// This package does not verify id_tokens, so it does not ask for one.
/// A test checks this list against the scopes the IdP advertises.
enum AccountScope {
  name('name'),
  profile('profile'),
  picture('picture'),
  email('email'),
  phoneNumber('phone_number'),
  studentId('student_id'),
  offlineAccess('offline_access');

  const AccountScope(this.value);

  /// The scope as sent to the IdP.
  final String value;
}
