import {
	Controller,
	Get,
	Post,
	Query,
	Body,
	Param,
	UseGuards,
	Res,
	HttpStatus,
	BadRequestException,
} from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBearerAuth,
	ApiQuery,
	ApiParam,
} from '@nestjs/swagger';
import express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { StoreAccessGuard } from '../../auth/guards/store-access.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { GoogleOAuthService } from './google-oauth.service';
import { StoresService } from '../../stores/stores.service';
import { GoogleAdsAccountDto } from './dto/google-oauth.dto';
import { ConfigService } from '@nestjs/config';

@ApiTags('Google Ads Integration')
@ApiBearerAuth('JWT-auth')
@Controller('integrations/google')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GoogleOAuthController {
	constructor(
		private readonly googleOAuthService: GoogleOAuthService,
		private readonly storesService: StoresService,
		private readonly configService: ConfigService,
	) {}

	@Get('auth/:storeId')
	@Roles(UserRole.ADMIN, UserRole.MANAGER)
	@UseGuards(StoreAccessGuard)
	@ApiOperation({
		summary: 'Initiate Google Ads OAuth flow',
		description:
			'Returns authorization URL to redirect user for Google Ads authentication',
	})
	@ApiParam({ name: 'storeId', description: 'Store ID' })
	@ApiResponse({
		status: 200,
		description: 'Authorization URL generated',
		schema: {
			type: 'object',
			properties: {
				authUrl: {
					type: 'string',
					example: 'https://accounts.google.com/o/oauth2/v2/auth?...',
				},
				storeId: { type: 'string' },
			},
		},
	})
	async initiateAuth(@Param('storeId') storeId: string) {
		await this.storesService.findOne(storeId); // Verify store exists

		const authUrl = this.googleOAuthService.getAuthorizationUrl(storeId);

		return {
			authUrl,
			storeId,
			message: 'Redirect user to authUrl to authorize Google Ads access',
		};
	}

	@Get('callback')
	@ApiOperation({
		summary: 'Google OAuth callback',
		description:
			'Handles OAuth callback from Google and exchanges code for tokens',
	})
	@ApiQuery({
		name: 'code',
		required: true,
		description: 'Authorization code from Google',
	})
	@ApiQuery({
		name: 'state',
		required: true,
		description: 'Store ID passed in state parameter',
	})
	@ApiResponse({
		status: 302,
		description: 'Redirects to frontend with success/error',
	})
	async handleCallback(
		@Query('code') code: string,
		@Query('state') storeId: string,
		@Res() res: express.Response,
	) {
		const frontendUrl = this.configService.get<string>('FRONTEND_URL');

		try {
			if (!code || !storeId) {
				throw new BadRequestException(
					'Missing code or state parameter',
				);
			}

			// Exchange code for tokens
			const tokens =
				await this.googleOAuthService.getTokensFromCode(code);

			// Get accessible Google Ads accounts
			const accessibleCustomers =
				await this.googleOAuthService.getAccessibleCustomers(
					tokens.access_token,
				);

			if (accessibleCustomers.length === 0) {
				throw new BadRequestException(
					'No Google Ads accounts found for this user',
				);
			}

			// Update store with OAuth tokens
			const store = await this.storesService.findOne(storeId);
			store.googleAccessToken = tokens.access_token;
			store.googleRefreshToken = tokens.refresh_token;
			store.googleTokenExpiry = new Date(tokens.expiry_date);
			await store.save();

			// Redirect to frontend with success and available accounts
			const redirectUrl = `${frontendUrl}/stores/${storeId}/google-ads/select?accounts=${encodeURIComponent(JSON.stringify(accessibleCustomers))}`;
			return res.redirect(redirectUrl);
		} catch (error) {
			// Redirect to frontend with error
			const redirectUrl = `${frontendUrl}/stores/${storeId}/google-ads/error?message=${encodeURIComponent((error as any).message)}`;
			return res.redirect(redirectUrl);
		}
	}

	@Post('stores/:storeId/select-account')
	@Roles(UserRole.ADMIN, UserRole.MANAGER)
	@UseGuards(StoreAccessGuard)
	@ApiOperation({
		summary: 'Select Google Ads account for store',
		description: 'Links a specific Google Ads customer ID to the store',
	})
	@ApiParam({ name: 'storeId', description: 'Store ID' })
	@ApiResponse({
		status: 200,
		description: 'Google Ads account linked successfully',
	})
	async selectAccount(
		@Param('storeId') storeId: string,
		@Body() dto: GoogleAdsAccountDto,
	) {
		const store = await this.storesService.findOne(storeId);

		if (!store.googleAccessToken) {
			throw new BadRequestException(
				'Store not authenticated with Google. Please authorize first.',
			);
		}

		// Validate that the customer ID is accessible
		const hasAccess = await this.googleOAuthService.validateCustomerAccess(
			store.googleAccessToken,
			dto.customerId,
		);

		if (!hasAccess) {
			throw new BadRequestException(
				'You do not have access to this Google Ads account',
			);
		}

		// Update store with selected customer ID
		store.googleCustomerId = dto.customerId;
		await store.save();

		return {
			message: 'Google Ads account linked successfully',
			storeId: store._id,
			storeName: store.name,
			customerId: dto.customerId,
		};
	}

	@Get('stores/:storeId/accounts')
	@Roles(UserRole.ADMIN, UserRole.MANAGER)
	@UseGuards(StoreAccessGuard)
	@ApiOperation({
		summary: 'Get accessible Google Ads accounts',
		description:
			'Returns list of Google Ads accounts accessible with current auth',
	})
	@ApiParam({ name: 'storeId', description: 'Store ID' })
	@ApiResponse({
		status: 200,
		description: 'List of accessible Google Ads accounts',
		schema: {
			type: 'object',
			properties: {
				accounts: {
					type: 'array',
					items: { type: 'string' },
				},
				currentCustomerId: { type: 'string', nullable: true },
			},
		},
	})
	async getAccessibleAccounts(@Param('storeId') storeId: string) {
		const store = await this.storesService.findOne(storeId);

		if (!store.googleAccessToken) {
			throw new BadRequestException(
				'Store not authenticated with Google. Please authorize first.',
			);
		}

		const accounts = await this.googleOAuthService.getAccessibleCustomers(
			store.googleAccessToken,
		);

		return {
			accounts,
			currentCustomerId: store.googleCustomerId || null,
		};
	}

	@Post('stores/:storeId/disconnect')
	@Roles(UserRole.ADMIN, UserRole.MANAGER)
	@UseGuards(StoreAccessGuard)
	@ApiOperation({
		summary: 'Disconnect Google Ads from store',
		description: 'Removes Google Ads authentication from store',
	})
	@ApiParam({ name: 'storeId', description: 'Store ID' })
	@ApiResponse({
		status: 200,
		description: 'Google Ads disconnected successfully',
	})
	async disconnectGoogleAds(@Param('storeId') storeId: string) {
		const store = await this.storesService.findOne(storeId);

		store.googleAccessToken = undefined;
		store.googleRefreshToken = undefined;
		store.googleCustomerId = undefined;
		store.googleTokenExpiry = undefined;
		await store.save();

		return {
			message: 'Google Ads disconnected successfully',
			storeId: store._id,
			storeName: store.name,
		};
	}

	@Get('stores/:storeId/status')
	@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.VIEWER)
	@UseGuards(StoreAccessGuard)
	@ApiOperation({
		summary: 'Check Google Ads connection status',
		description: 'Returns whether store is connected to Google Ads',
	})
	@ApiParam({ name: 'storeId', description: 'Store ID' })
	@ApiResponse({
		status: 200,
		description: 'Connection status',
		schema: {
			type: 'object',
			properties: {
				connected: { type: 'boolean' },
				customerId: { type: 'string', nullable: true },
				hasValidToken: { type: 'boolean' },
			},
		},
	})
	async getConnectionStatus(@Param('storeId') storeId: string) {
		const store = await this.storesService.findOne(storeId);

		const hasValidToken =
			!!store.googleAccessToken &&
			!!store.googleRefreshToken &&
			store.googleTokenExpiry &&
			new Date(store.googleTokenExpiry) > new Date();

		return {
			connected: !!store.googleCustomerId && hasValidToken,
			customerId: store.googleCustomerId || null,
			hasValidToken,
		};
	}
}
