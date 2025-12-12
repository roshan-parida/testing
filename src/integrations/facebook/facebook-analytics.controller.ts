import {
	Controller,
	Get,
	Param,
	Query,
	UseGuards,
	Logger,
	BadRequestException,
} from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBearerAuth,
	ApiParam,
	ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { StoreAccessGuard } from '../../auth/guards/store-access.guard';
import { StoresService } from '../../stores/stores.service';
import { FacebookService } from './facebook.service';

@ApiTags('Facebook Analytics')
@ApiBearerAuth('JWT-auth')
@Controller('facebook-analytics')
@UseGuards(JwtAuthGuard, RolesGuard, StoreAccessGuard)
export class FacebookAnalyticsController {
	private readonly logger = new Logger(FacebookAnalyticsController.name);

	constructor(
		private readonly storesService: StoresService,
		private readonly facebookService: FacebookService,
	) {}

	private validateDateRange(startDate: string, endDate: string): void {
		const start = new Date(startDate);
		const end = new Date(endDate);

		if (isNaN(start.getTime()) || isNaN(end.getTime())) {
			throw new BadRequestException(
				'Invalid date format. Use YYYY-MM-DD',
			);
		}

		if (start > end) {
			throw new BadRequestException(
				'Start date must be before or equal to end date',
			);
		}
	}

	private validateBreakdown(breakdown: string): void {
		const validBreakdowns = [
			'country',
			'region',
			'age',
			'gender',
			'publisher_platform',
			'publisher_platform,platform_position',
			'device_platform',
			'image_asset',
			'video_asset',
			'title_asset',
			'body_asset',
		];

		if (!validBreakdowns.includes(breakdown)) {
			throw new BadRequestException(
				`Invalid breakdown. Valid values: ${validBreakdowns.join(', ')}`,
			);
		}
	}

	@Get('stores/:storeId/insights')
	@ApiOperation({
		summary: 'Get unified insights with optional breakdown',
		description:
			'Fetch campaign, ad set, or ad insights in a single endpoint with optional demographic/placement breakdowns',
	})
	@ApiParam({ name: 'storeId', description: 'Store ID' })
	@ApiQuery({
		name: 'startDate',
		required: true,
		type: String,
		description: 'Start date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'endDate',
		required: true,
		type: String,
		description: 'End date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'level',
		required: false,
		enum: ['account', 'campaign', 'adset', 'ad'],
		description: 'Insight level (default: campaign)',
	})
	@ApiQuery({
		name: 'breakdown',
		required: false,
		type: String,
		description:
			'Breakdown dimension: country, region, age, gender, publisher_platform, device_platform, image_asset, video_asset, title_asset, body_asset',
	})
	@ApiQuery({
		name: 'entityId',
		required: false,
		type: String,
		description:
			'Specific campaign/adset/ad ID to filter (optional, for drilling down)',
	})
	@ApiQuery({
		name: 'limit',
		required: false,
		type: Number,
		description: 'Maximum number of results (default: 100)',
	})
	@ApiResponse({
		status: 200,
		description: 'Insights retrieved successfully',
		schema: {
			type: 'object',
			properties: {
				storeId: { type: 'string' },
				storeName: { type: 'string' },
				dateRange: {
					type: 'object',
					properties: {
						from: { type: 'string' },
						to: { type: 'string' },
					},
				},
				level: { type: 'string' },
				breakdown: { type: 'string', nullable: true },
				entityId: { type: 'string', nullable: true },
				data: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: { type: 'string' },
							name: { type: 'string' },
							results: { type: 'number' },
							reach: { type: 'number' },
							impressions: { type: 'number' },
							frequency: { type: 'number' },
							costPerResult: { type: 'number' },
							amountSpent: { type: 'number' },
							cpm: { type: 'number' },
							linkClicks: { type: 'number' },
							cpc: { type: 'number' },
							ctr: { type: 'number' },
							linkCtr: { type: 'number' },
							landingPageViews: { type: 'number' },
							resultRoas: { type: 'number' },
							resultsValue: { type: 'number' },
						},
					},
				},
				totalRecords: { type: 'number' },
			},
		},
	})
	@ApiResponse({ status: 400, description: 'Invalid parameters' })
	@ApiResponse({ status: 404, description: 'Store not found' })
	async getInsights(
		@Param('storeId') storeId: string,
		@Query('startDate') startDate: string,
		@Query('endDate') endDate: string,
		@Query('level') level?: string,
		@Query('breakdown') breakdown?: string,
		@Query('entityId') entityId?: string,
		@Query('limit') limit?: number,
	): Promise<any> {
		this.validateDateRange(startDate, endDate);

		if (breakdown) {
			this.validateBreakdown(breakdown);
		}

		const store = await this.storesService.findOne(storeId);
		const from = new Date(startDate);
		const to = new Date(endDate);
		const insightLevel = (level as any) || 'campaign';

		this.logger.log(
			`Fetching ${insightLevel} insights for ${store.name}: ${startDate} to ${endDate}${breakdown ? ` with breakdown: ${breakdown}` : ''}`,
		);

		const data = await this.facebookService.fetchInsights(
			store,
			from,
			to,
			insightLevel,
			breakdown,
			entityId,
			limit || 100,
		);

		return {
			storeId: store._id,
			storeName: store.name,
			dateRange: {
				from: startDate,
				to: endDate,
			},
			level: insightLevel,
			breakdown: breakdown || null,
			entityId: entityId || null,
			data,
			totalRecords: data.length,
		};
	}

	@Get('stores/:storeId/campaigns')
	@ApiOperation({
		summary: 'Get campaign metrics with metadata',
		description:
			'Fetch campaigns with full metadata (status, objective, budget) and performance metrics',
	})
	@ApiParam({ name: 'storeId', description: 'Store ID' })
	@ApiQuery({
		name: 'startDate',
		required: true,
		type: String,
		description: 'Start date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'endDate',
		required: true,
		type: String,
		description: 'End date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'limit',
		required: false,
		type: Number,
		description: 'Number of campaigns to return (default: 100)',
	})
	@ApiResponse({
		status: 200,
		description: 'Campaign metrics retrieved successfully',
	})
	@ApiResponse({ status: 404, description: 'Store not found' })
	async getCampaigns(
		@Param('storeId') storeId: string,
		@Query('startDate') startDate: string,
		@Query('endDate') endDate: string,
		@Query('limit') limit?: number,
	): Promise<any> {
		this.validateDateRange(startDate, endDate);

		const store = await this.storesService.findOne(storeId);
		const from = new Date(startDate);
		const to = new Date(endDate);

		this.logger.log(
			`Fetching campaigns for ${store.name}: ${startDate} to ${endDate}`,
		);

		const campaigns = await this.facebookService.fetchCampaignsWithDetails(
			store,
			from,
			to,
			limit || 100,
		);

		return {
			storeId: store._id,
			storeName: store.name,
			dateRange: {
				from: startDate,
				to: endDate,
			},
			campaigns,
			totalCampaigns: campaigns.length,
		};
	}

	@Get('stores/:storeId/adsets')
	@ApiOperation({
		summary: 'Get ad set metrics with metadata',
		description:
			'Fetch ad sets with full metadata and performance metrics, optionally filtered by campaign',
	})
	@ApiParam({ name: 'storeId', description: 'Store ID' })
	@ApiQuery({
		name: 'startDate',
		required: true,
		type: String,
		description: 'Start date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'endDate',
		required: true,
		type: String,
		description: 'End date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'campaignId',
		required: false,
		type: String,
		description: 'Filter by campaign ID',
	})
	@ApiQuery({
		name: 'limit',
		required: false,
		type: Number,
		description: 'Number of ad sets to return (default: 100)',
	})
	@ApiResponse({
		status: 200,
		description: 'Ad set metrics retrieved successfully',
	})
	@ApiResponse({ status: 404, description: 'Store not found' })
	async getAdSets(
		@Param('storeId') storeId: string,
		@Query('startDate') startDate: string,
		@Query('endDate') endDate: string,
		@Query('campaignId') campaignId?: string,
		@Query('limit') limit?: number,
	): Promise<any> {
		this.validateDateRange(startDate, endDate);

		const store = await this.storesService.findOne(storeId);
		const from = new Date(startDate);
		const to = new Date(endDate);

		this.logger.log(
			`Fetching ad sets for ${store.name}: ${startDate} to ${endDate}${campaignId ? ` (campaign: ${campaignId})` : ''}`,
		);

		const adSets = await this.facebookService.fetchAdSetsWithDetails(
			store,
			from,
			to,
			campaignId,
			limit || 100,
		);

		return {
			storeId: store._id,
			storeName: store.name,
			dateRange: {
				from: startDate,
				to: endDate,
			},
			campaignId: campaignId || null,
			adSets,
			totalAdSets: adSets.length,
		};
	}

	@Get('stores/:storeId/ads')
	@ApiOperation({
		summary: 'Get individual ad metrics with metadata',
		description:
			'Fetch ads with full metadata and performance metrics, optionally filtered by ad set',
	})
	@ApiParam({ name: 'storeId', description: 'Store ID' })
	@ApiQuery({
		name: 'startDate',
		required: true,
		type: String,
		description: 'Start date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'endDate',
		required: true,
		type: String,
		description: 'End date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'adSetId',
		required: false,
		type: String,
		description: 'Filter by ad set ID',
	})
	@ApiQuery({
		name: 'limit',
		required: false,
		type: Number,
		description: 'Number of ads to return (default: 100)',
	})
	@ApiResponse({
		status: 200,
		description: 'Ad metrics retrieved successfully',
	})
	@ApiResponse({ status: 404, description: 'Store not found' })
	async getAds(
		@Param('storeId') storeId: string,
		@Query('startDate') startDate: string,
		@Query('endDate') endDate: string,
		@Query('adSetId') adSetId?: string,
		@Query('limit') limit?: number,
	): Promise<any> {
		this.validateDateRange(startDate, endDate);

		const store = await this.storesService.findOne(storeId);
		const from = new Date(startDate);
		const to = new Date(endDate);

		this.logger.log(
			`Fetching ads for ${store.name}: ${startDate} to ${endDate}${adSetId ? ` (ad set: ${adSetId})` : ''}`,
		);

		const ads = await this.facebookService.fetchAdsWithDetails(
			store,
			from,
			to,
			adSetId,
			limit || 100,
		);

		return {
			storeId: store._id,
			storeName: store.name,
			dateRange: {
				from: startDate,
				to: endDate,
			},
			adSetId: adSetId || null,
			ads,
			totalAds: ads.length,
		};
	}

	// Convenience endpoints for common breakdowns
	@Get('stores/:storeId/breakdown/demographics')
	@ApiOperation({
		summary: 'Get demographic breakdown (age + gender)',
		description:
			'Convenience endpoint for age and gender breakdowns at any level',
	})
	@ApiParam({ name: 'storeId', description: 'Store ID' })
	@ApiQuery({
		name: 'startDate',
		required: true,
		type: String,
		description: 'Start date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'endDate',
		required: true,
		type: String,
		description: 'End date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'level',
		required: false,
		enum: ['account', 'campaign', 'adset', 'ad'],
		description: 'Breakdown level (default: account)',
	})
	@ApiQuery({
		name: 'entityId',
		required: false,
		type: String,
		description: 'Campaign/AdSet/Ad ID for filtered breakdown',
	})
	@ApiResponse({
		status: 200,
		description: 'Demographic breakdown retrieved successfully',
	})
	async getDemographicBreakdown(
		@Param('storeId') storeId: string,
		@Query('startDate') startDate: string,
		@Query('endDate') endDate: string,
		@Query('level') level?: string,
		@Query('entityId') entityId?: string,
	): Promise<any> {
		this.validateDateRange(startDate, endDate);

		const store = await this.storesService.findOne(storeId);
		const from = new Date(startDate);
		const to = new Date(endDate);
		const insightLevel = (level as any) || 'account';

		this.logger.log(
			`Fetching demographic breakdown for ${store.name}: ${startDate} to ${endDate}`,
		);

		const [ageData, genderData] = await Promise.all([
			this.facebookService.fetchInsights(
				store,
				from,
				to,
				insightLevel,
				'age',
				entityId,
			),
			this.facebookService.fetchInsights(
				store,
				from,
				to,
				insightLevel,
				'gender',
				entityId,
			),
		]);

		return {
			storeId: store._id,
			storeName: store.name,
			dateRange: { from: startDate, to: endDate },
			level: insightLevel,
			breakdowns: {
				age: ageData,
				gender: genderData,
			},
		};
	}

	@Get('stores/:storeId/breakdown/placements')
	@ApiOperation({
		summary: 'Get placement breakdown (platform + position)',
		description:
			'Convenience endpoint for platform and placement breakdowns',
	})
	@ApiParam({ name: 'storeId', description: 'Store ID' })
	@ApiQuery({
		name: 'startDate',
		required: true,
		type: String,
		description: 'Start date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'endDate',
		required: true,
		type: String,
		description: 'End date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'level',
		required: false,
		enum: ['account', 'campaign', 'adset', 'ad'],
		description: 'Breakdown level (default: account)',
	})
	@ApiQuery({
		name: 'entityId',
		required: false,
		type: String,
		description: 'Campaign/AdSet/Ad ID for filtered breakdown',
	})
	@ApiResponse({
		status: 200,
		description: 'Placement breakdown retrieved successfully',
	})
	async getPlacementBreakdown(
		@Param('storeId') storeId: string,
		@Query('startDate') startDate: string,
		@Query('endDate') endDate: string,
		@Query('level') level?: string,
		@Query('entityId') entityId?: string,
	): Promise<any> {
		this.validateDateRange(startDate, endDate);

		const store = await this.storesService.findOne(storeId);
		const from = new Date(startDate);
		const to = new Date(endDate);
		const insightLevel = (level as any) || 'account';

		this.logger.log(
			`Fetching placement breakdown for ${store.name}: ${startDate} to ${endDate}`,
		);

		const data = await this.facebookService.fetchInsights(
			store,
			from,
			to,
			insightLevel,
			'publisher_platform,platform_position',
			entityId,
		);

		return {
			storeId: store._id,
			storeName: store.name,
			dateRange: { from: startDate, to: endDate },
			level: insightLevel,
			breakdownType: 'placement',
			data,
		};
	}

	@Get('stores/:storeId/breakdown/creative-assets')
	@ApiOperation({
		summary: 'Get creative asset performance',
		description:
			'Get breakdown by creative assets (images, videos, titles, body text)',
	})
	@ApiParam({ name: 'storeId', description: 'Store ID' })
	@ApiQuery({
		name: 'startDate',
		required: true,
		type: String,
		description: 'Start date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'endDate',
		required: true,
		type: String,
		description: 'End date (YYYY-MM-DD)',
	})
	@ApiQuery({
		name: 'assetType',
		required: true,
		enum: ['image_asset', 'video_asset', 'title_asset', 'body_asset'],
		description: 'Type of creative asset to analyze',
	})
	@ApiQuery({
		name: 'level',
		required: false,
		enum: ['account', 'campaign', 'adset', 'ad'],
		description: 'Breakdown level (default: ad)',
	})
	@ApiQuery({
		name: 'entityId',
		required: false,
		type: String,
		description: 'Campaign/AdSet/Ad ID for filtered breakdown',
	})
	@ApiResponse({
		status: 200,
		description: 'Creative asset breakdown retrieved successfully',
	})
	async getCreativeAssetBreakdown(
		@Param('storeId') storeId: string,
		@Query('startDate') startDate: string,
		@Query('endDate') endDate: string,
		@Query('assetType') assetType: string,
		@Query('level') level?: string,
		@Query('entityId') entityId?: string,
	): Promise<any> {
		this.validateDateRange(startDate, endDate);

		const validAssetTypes = [
			'image_asset',
			'video_asset',
			'title_asset',
			'body_asset',
		];
		if (!validAssetTypes.includes(assetType)) {
			throw new BadRequestException(
				`Invalid assetType. Valid values: ${validAssetTypes.join(', ')}`,
			);
		}

		const store = await this.storesService.findOne(storeId);
		const from = new Date(startDate);
		const to = new Date(endDate);
		const insightLevel = (level as any) || 'ad';

		this.logger.log(
			`Fetching ${assetType} breakdown for ${store.name}: ${startDate} to ${endDate}`,
		);

		const data = await this.facebookService.fetchInsights(
			store,
			from,
			to,
			insightLevel,
			assetType,
			entityId,
		);

		return {
			storeId: store._id,
			storeName: store.name,
			dateRange: { from: startDate, to: endDate },
			level: insightLevel,
			assetType,
			data,
		};
	}
}
