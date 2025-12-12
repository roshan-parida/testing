import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { Store } from '../../stores/schemas/store.schema';
import { ConfigService } from '@nestjs/config';
import { GoogleOAuthService } from './google-oauth.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction, AuditStatus } from '../../audit/schemas/audit-log.schema';

interface DailyAdSpend {
	date: string;
	spend: number;
}

@Injectable()
export class GoogleService {
	private readonly logger = new Logger(GoogleService.name);
	private readonly API_VERSION = 'v18';

	constructor(
		private readonly configService: ConfigService,
		private readonly googleOAuthService: GoogleOAuthService,
		private readonly auditService: AuditService,
	) {}

	/**
	 * Get valid access token (refresh if needed)
	 */
	private async getValidAccessToken(store: Store): Promise<string> {
		if (!store.googleRefreshToken) {
			throw new BadRequestException(
				'Store not connected to Google Ads. Please authorize access first.',
			);
		}

		// Check if current token is still valid (with 5 min buffer)
		const now = Date.now();
		const expiryDate = store.googleTokenExpiry
			? new Date(store.googleTokenExpiry).getTime()
			: 0;

		if (store.googleAccessToken && expiryDate > now + 300000) {
			return store.googleAccessToken;
		}

		// Token expired or about to expire, refresh it
		this.logger.log(
			`Refreshing Google access token for store: ${store.name}`,
		);
		const newAccessToken = await this.googleOAuthService.refreshAccessToken(
			store.googleRefreshToken,
		);

		// Update store with new token
		store.googleAccessToken = newAccessToken;
		store.googleTokenExpiry = new Date(Date.now() + 3600000); // 1 hour
		await store.save();

		return newAccessToken;
	}

	/**
	 * Fetch ad spend from Google Ads
	 */
	async fetchAdSpend(
		store: Store,
		from: Date,
		to: Date,
	): Promise<DailyAdSpend[]> {
		if (!store.googleCustomerId) {
			this.logger.warn(
				`Store ${store.name} has no Google Ads customer ID configured`,
			);
			return [];
		}

		try {
			const startTime = Date.now();
			await this.auditService.log({
				action: AuditAction.FACEBOOK_SYNC_STARTED, // Reusing FB actions for now
				status: AuditStatus.PENDING,
				storeId: store._id.toString(),
				storeName: store.name,
				metadata: {
					platform: 'google_ads',
					from: from.toISOString(),
					to: to.toISOString(),
				},
			});

			const accessToken = await this.getValidAccessToken(store);
			const customerId = store.googleCustomerId.replace(/-/g, ''); // Remove dashes

			// Build Google Ads Query Language (GAQL) query
			const query = `
				SELECT
					segments.date,
					metrics.cost_micros
				FROM campaign
				WHERE segments.date >= '${from.toISOString().slice(0, 10)}'
				AND segments.date <= '${to.toISOString().slice(0, 10)}'
				ORDER BY segments.date ASC
			`;

			const url = `https://googleads.googleapis.com/v16/customers/${customerId}/googleAds:searchStream`;

			this.logger.log(
				`Fetching Google Ads spend for ${store.name}: ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
			);

			const response = await axios.post(
				url,
				{ query },
				{
					headers: {
						Authorization: `Bearer ${accessToken}`,
						'developer-token': this.configService.get<string>(
							'GOOGLE_DEVELOPER_TOKEN',
						),
						'Content-Type': 'application/json',
					},
				},
			);

			// Process response and aggregate by date
			const spendByDate = new Map<string, number>();

			if (response.data && Array.isArray(response.data)) {
				for (const batch of response.data) {
					if (batch.results) {
						for (const result of batch.results) {
							const date = result.segments?.date;
							const costMicros = parseInt(
								result.metrics?.costMicros || '0',
								10,
							);
							const costDollars = costMicros / 1000000; // Convert micros to dollars

							if (date) {
								const existing = spendByDate.get(date) || 0;
								spendByDate.set(date, existing + costDollars);
							}
						}
					}
				}
			}

			const dailySpend: DailyAdSpend[] = Array.from(
				spendByDate.entries(),
			).map(([date, spend]) => ({
				date,
				spend,
			}));

			this.logger.log(
				`✓ Retrieved ${dailySpend.length} days of Google Ads spend for ${store.name}`,
			);

			await this.auditService.log({
				action: AuditAction.FACEBOOK_AD_SPEND_FETCHED, // Reusing
				status: AuditStatus.SUCCESS,
				storeId: store._id.toString(),
				storeName: store.name,
				duration: Date.now() - startTime,
				metadata: {
					platform: 'google_ads',
					daysProcessed: dailySpend.length,
				},
			});

			return dailySpend;
		} catch (error) {
			const err = error as AxiosError;
			this.logger.error(
				`Google Ads API Error for ${store.name}: ${err.message}`,
			);

			await this.auditService.log({
				action: AuditAction.FACEBOOK_SYNC_FAILED, // Reusing
				status: AuditStatus.FAILURE,
				storeId: store._id.toString(),
				storeName: store.name,
				errorMessage: (err as any).message,
				errorDetails: err.response?.data || err,
				metadata: { platform: 'google_ads' },
			});

			return [];
		}
	}
}
