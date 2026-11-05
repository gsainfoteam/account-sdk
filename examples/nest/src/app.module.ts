import { Module } from '@nestjs/common';

import { AccountModule } from './account';
import { AuthController } from './auth.controller';
import { MeController } from './me.controller';
import { SessionGuard } from './session.guard';
import { Sessions } from './sessions';

@Module({
  imports: [
    AccountModule.forRoot({
      issuer: process.env.ACCOUNT_ISSUER ?? 'staging',
      clientId: process.env.ACCOUNT_TEST_CLIENT_ID ?? '',
      clientSecret: process.env.ACCOUNT_TEST_CLIENT_SECRET,
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [Sessions, SessionGuard],
})
export class AppModule {}
