import {
	IsEmail,
	IsString,
	MinLength,
	IsNotEmpty,
	IsUrl,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignupDto {
	@ApiProperty({
		example: 'John Doe',
		description: 'Full Name',
	})
	@IsString()
	@IsNotEmpty()
	name: string;

	@ApiProperty({
		example: 'user@example.com',
		description: 'User email address',
	})
	@IsEmail()
	email: string;

	@ApiProperty({
		example: 'password123',
		description: 'Password (min 8 characters)',
	})
	@IsString()
	@MinLength(8)
	password: string;

	@ApiProperty({ example: 'My Store', description: 'Store name' })
	@IsString()
	@IsNotEmpty()
	storeName: string;

	@ApiProperty({
		example: 'mystore.myshopify.com',
		description: 'Shopify store URL',
	})
	@IsUrl()
	@IsNotEmpty()
	storeUrl: string;
}
