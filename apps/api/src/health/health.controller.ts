import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DbService } from '../db/db.service';

const ReadyBody = {
  type: 'object',
  required: ['status'],
  properties: { status: { type: 'string', example: 'ok' } },
};

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly dbService: DbService) {}

  @Get('readyz')
  @ApiOperation({ summary: 'Readiness probe (checks the database)' })
  @ApiOkResponse({
    description: 'The database is reachable',
    schema: ReadyBody,
  })
  @ApiResponse({
    status: 503,
    description: 'The database is unreachable',
    schema: {
      type: 'object',
      required: ['status'],
      properties: { status: { type: 'string', example: 'unavailable' } },
    },
  })
  async ready(): Promise<{ status: string }> {
    try {
      await this.dbService.ping();
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
  }
}
