import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

interface GoogleTokens {
	access_token: string;
	refresh_token: string;
	expiry_date: number;
}

@Injectable()
export class GoogleOAuthService {
	private readonly logger = new Logger(GoogleOAuthService.name);
	private oauth2Client: OAuth2Client;

	constructor(private readonly config: ConfigService) {
		this.oauth2Client = new google.auth.OAuth2(
			this.config.get<string>('GOOGLE_CLIENT_ID'),
			this.config.get<string>('GOOGLE_CLIENT_SECRET'),
			this.config.get<string>('GOOGLE_REDIRECT_URI'),
		);
	}

	/**
	 * Generate OAuth URL for user to authorize Google Ads access
	 */
	getAuthorizationUrl(storeId: string): string {
		const scopes = [
			'https://www.googleapis.com/auth/adwords', // Google Ads API access
		];

		const authUrl = this.oauth2Client.generateAuthUrl({
			access_type: 'offline', // Request refresh token
			scope: scopes,
			prompt: 'consent', // Force consent screen to get refresh token
			state: storeId, // Pass storeId in state to retrieve after callback
		});

		this.logger.log(`Generated Google OAuth URL for store: ${storeId}`);
		return authUrl;
	}

	/**
	 * Exchange authorization code for access and refresh tokens
	 */
	async getTokensFromCode(code: string): Promise<GoogleTokens> {
		try {
			const { tokens } = await this.oauth2Client.getToken(code);

			if (!tokens.access_token || !tokens.refresh_token) {
				throw new BadRequestException(
					'Failed to obtain tokens from Google',
				);
			}

			this.logger.log('Successfully obtained Google OAuth tokens');

			return {
				access_token: tokens.access_token,
				refresh_token: tokens.refresh_token,
				expiry_date: tokens.expiry_date || Date.now() + 3600000, // 1 hour default
			};
		} catch (error) {
			this.logger.error(
				`Failed to exchange code for tokens: ${(error as any).message}`,
			);
			throw new BadRequestException('Invalid authorization code');
		}
	}

	/**
	 * Refresh access token using refresh token
	 */
	async refreshAccessToken(refreshToken: string): Promise<string> {
		try {
			this.oauth2Client.setCredentials({
				refresh_token: refreshToken,
			});

			const { credentials } =
				await this.oauth2Client.refreshAccessToken();

			if (!credentials.access_token) {
				throw new Error('No access token in refresh response');
			}

			this.logger.log('Successfully refreshed Google access token');
			return credentials.access_token;
		} catch (error) {
			this.logger.error(
				`Failed to refresh access token: ${(error as any).message}`,
			);
			throw new BadRequestException('Failed to refresh access token');
		}
	}

	/**
	 * Get list of accessible Google Ads accounts
	 */
	async getAccessibleCustomers(accessToken: string): Promise<string[]> {
		try {
			const response = await axios.get(
				'https://googleads.googleapis.com/v16/customers:listAccessibleCustomers',
				{
					headers: {
						Authorization: `Bearer ${accessToken}`,
						'developer-token': this.config.get<string>(
							'GOOGLE_DEVELOPER_TOKEN',
						),
					},
				},
			);

			const customerIds =
				response.data.resourceNames?.map((name: string) =>
					name.replace('customers/', ''),
				) || [];

			this.logger.log(
				`Found ${customerIds.length} accessible Google Ads accounts`,
			);
			return customerIds;
		} catch (error) {
			this.logger.error(
				`Failed to fetch accessible customers: ${(error as any).message}`,
			);
			throw new BadRequestException(
				'Failed to fetch Google Ads accounts',
			);
		}
	}

	/**
	 * Validate that a customer ID is accessible with given token
	 */
	async validateCustomerAccess(
		accessToken: string,
		customerId: string,
	): Promise<boolean> {
		try {
			const accessibleCustomers =
				await this.getAccessibleCustomers(accessToken);
			return accessibleCustomers.includes(customerId.replace(/-/g, ''));
		} catch (error) {
			this.logger.error(
				`Failed to validate customer access: ${(error as any).message}`,
			);
			return false;
		}
	}
}
