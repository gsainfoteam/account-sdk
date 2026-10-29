import '../constants.dart';

class AccountIssuer {
  const AccountIssuer._(this.apiOrigin);

  factory AccountIssuer.custom(Uri apiOrigin) => AccountIssuer._(apiOrigin.toString());

  AccountIssuer.of(AccountEnvironment environment) : apiOrigin = environment.apiOrigin;

  static final production = AccountIssuer.of(AccountEnvironment.production);
  static final staging = AccountIssuer.of(AccountEnvironment.staging);

  final String apiOrigin;

  Uri get discoveryUrl => Uri.parse(apiOrigin).replace(path: AccountConstants.discoveryPath);
}
