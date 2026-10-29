import { memorySessionStore } from '@gsainfoteam/account-nest';
import { Module } from '@nestjs/common';

import { AccountModule } from './account';
import { MeController } from './me.controller';

@Module({
  imports: [
    AccountModule.forRoot({
      issuer: process.env.ACCOUNT_ISSUER ?? 'staging',
      clientId: process.env.ACCOUNT_TEST_CLIENT_ID ?? '',
      clientSecret: process.env.ACCOUNT_TEST_CLIENT_SECRET,
      isGlobal: true,
      session: {
        secret: process.env.SESSION_SECRET ?? 'example-only-secret-change-me-please',
        store: memorySessionStore(),
        resolve: (user) => ({ subject: user.sub }),
      },
    }),
  ],
  controllers: [MeController],
})
export class AppModule {}
