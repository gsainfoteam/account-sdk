import { Module } from '@nestjs/common';

import { AccountModule } from './account';
import { AuthController } from './auth.controller';
import { SessionService } from './session.service';

@Module({
  imports: [
    AccountModule.forRoot({
      issuer: process.env.ACCOUNT_ISSUER ?? 'staging',
      clientId: process.env.ACCOUNT_TEST_CLIENT_ID ?? '',
      isGlobal: true,
    }),
  ],
  controllers: [AuthController],
  providers: [SessionService],
})
export class AppModule {}
