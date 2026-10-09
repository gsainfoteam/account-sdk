import { type AccountServerOptions } from '@gsainfoteam/account-server';
import { ConfigurableModuleBuilder } from '@nestjs/common';

export const ACCOUNT_SERVER = Symbol('ACCOUNT_SERVER');

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN, OPTIONS_TYPE, ASYNC_OPTIONS_TYPE } =
  new ConfigurableModuleBuilder<AccountServerOptions>()
    .setClassMethodName('forRoot')
    .setExtras({ isGlobal: false }, (definition, extras) => ({
      ...definition,
      global: extras.isGlobal,
    }))
    .build();
