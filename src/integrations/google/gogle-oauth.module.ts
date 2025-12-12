import { Module, forwardRef } from '@nestjs/common';
import { GoogleOAuthController } from './google-oauth.controller';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleService } from './google.service';
import { StoresModule } from '../../stores/stores.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
	imports: [forwardRef(() => StoresModule), AuditModule],
	controllers: [GoogleOAuthController],
	providers: [GoogleOAuthService, GoogleService],
	exports: [GoogleService, GoogleOAuthService],
})
export class GoogleOAuthModule {}
