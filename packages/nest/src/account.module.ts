import { createAccountServer, type AccountServerOptions } from '@gsainfoteam/account-server';
import { Module } from '@nestjs/common';

import {
  ACCOUNT_SERVER,
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
} from './account.module-definition';
import { AccountService } from './account.service';

@Module({
  providers: [
    {
      provide: ACCOUNT_SERVER,
      inject: [MODULE_OPTIONS_TOKEN],
      useFactory: (options: AccountServerOptions) => createAccountServer(options),
    },
    AccountService,
  ],
  exports: [AccountService],
})
/**
 * {@link AccountServerOptions} 로 {@link AccountService} 를 등록한다.
 *
 * @example
 * ```ts
 * AccountModule.forRootAsync({
 *   isGlobal: true,
 *   inject: [ConfigService],
 *   useFactory: (config: ConfigService) => ({
 *     issuer: 'production',
 *     clientId: config.getOrThrow('ACCOUNT_CLIENT_ID'),
 *     clientSecret: config.get('ACCOUNT_CLIENT_SECRET'),
 *   }),
 * });
 * ```
 */
export class AccountModule extends ConfigurableModuleClass {}
