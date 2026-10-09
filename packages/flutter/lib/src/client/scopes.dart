// id_token 을 검증하지 않으므로 openid 는 받지 않는다.
enum AccountScope {
  name('name'),
  profile('profile'),
  picture('picture'),
  email('email'),
  phoneNumber('phone_number'),
  studentId('student_id'),
  offlineAccess('offline_access');

  const AccountScope(this.value);

  final String value;
}
