import '../constants.dart';

/// IdP 배포 하나. API origin 으로 식별한다.
class AccountIssuer {
  const AccountIssuer._(this.apiOrigin);

  factory AccountIssuer.custom(Uri apiOrigin) => AccountIssuer._(apiOrigin.toString());

  /// 알려진 [AccountEnvironment] 의 issuer.
  AccountIssuer.of(AccountEnvironment environment) : apiOrigin = environment.apiOrigin;

  static final production = AccountIssuer.of(AccountEnvironment.production);
  static final staging = AccountIssuer.of(AccountEnvironment.staging);

  final String apiOrigin;

  /// OpenID discovery 문서. 항상 API 호스트에서 제공된다.
  Uri get discoveryUrl => Uri.parse(apiOrigin).replace(path: AccountConstants.discoveryPath);
}
