import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleOAuthCallbackDto {
	@ApiProperty({
		example: '4/0AX4XfWh...',
		description: 'Authorization code from Google OAuth',
	})
	@IsString()
	@IsNotEmpty()
	code: string;

	@ApiProperty({
		example: '507f1f77bcf86cd799439011',
		description: 'Store ID to link Google Ads account to',
	})
	@IsString()
	@IsNotEmpty()
	storeId: string;
}

export class GoogleAdsAccountDto {
	@ApiProperty({
		example: '123-456-7890',
		description: 'Google Ads customer ID',
	})
	@IsString()
	@IsNotEmpty()
	customerId: string;
}
