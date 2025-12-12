import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInvitationDto {
	@ApiProperty({
		example: 'John Doe',
		description: 'Full name',
	})
	@IsString()
	name: string;

	@ApiProperty({
		example: 'password123',
		description: 'Password (min 8 characters)',
	})
	@IsString()
	@MinLength(8)
	password: string;
}
