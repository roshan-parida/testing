import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('App')
@Controller()
export class AppController {
	constructor(private readonly appService: AppService) {}

	@Get('/')
	@ApiOperation({ summary: 'Get status' })
	@ApiOkResponse({
		description: 'Returns status string',
		schema: { type: 'string', example: 'Backend is running successfully!' },
	})
	getStatus(): string {
		return this.appService.getStatus();
	}

	@Get('/health')
	@ApiOperation({ summary: 'Health check endpoint' })
	@ApiOkResponse({
		description: 'Returns health status with timestamp',
		schema: {
			type: 'object',
			properties: {
				status: { type: 'string', example: 'ok' },
				timestamp: {
					type: 'string',
					example: '2024-12-02T10:30:00.000Z',
				},
			},
		},
	})
	healthCheck(): { status: string; timestamp: string } {
		return this.appService.getHealthCheck();
	}
}
