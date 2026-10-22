/// `openid` 를 뺀, IdP 가 받는 scope.
///
/// `openid` 는 [AccountClient] 가 항상 함께 요청한다. 서비스 백엔드가 id_token 으로 사용자를 확인하기 때문이다.
///
/// `pnpm contract:dart` 가 `packages/contract` 에서 생성한다. 손으로 고치지 않는다.
enum AccountScope {
  profile('profile'),
  name('name'),
  picture('picture'),
  email('email'),
  phoneNumber('phone_number'),
  studentId('student_id'),
  offlineAccess('offline_access');

  const AccountScope(this.value);

  /// IdP 에 보내는 scope 문자열.
  final String value;
}
