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
export class AccountModule extends ConfigurableModuleClass {}
