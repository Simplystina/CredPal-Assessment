import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiQuery,
} from '@nestjs/swagger';
import { FxService } from './fx.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerifiedGuard } from '../auth/guards/verified.guard';
import { SUPPORTED_CURRENCIES } from '../common/constants';
import { getRatesDto } from './dto/rates.dto';

@ApiTags('FX')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, VerifiedGuard)
@Controller('fx')
export class FxController {
    constructor(private readonly fxService: FxService) { }

    @Get('rates')
    @ApiOperation({
        summary: 'Get real-time FX rates',
        description: `Returns exchange rates for all supported currencies relative to the base currency.
        The supported currencies for this project are: ${SUPPORTED_CURRENCIES.join(', ')}`,
    })
    @ApiQuery({
        name: 'base',
        required: false,
        example: 'NGN',
        description: 'Base currency (default: NGN)',
    })
    @ApiResponse({
        status: 200,
        description: 'FX rates retrieved successfully',
        schema: {
            example: {
                base: 'NGN',
                rates: { USD: 0.00065, EUR: 0.00060, GBP: 0.00051 },
                cachedAt: '2024-01-01T12:00:00.000Z',
            },
        },
    })
    async getRates(@Query() dto: getRatesDto) {
        const rates = await this.fxService.getRates(dto.base.toUpperCase());
        return {
            base: dto.base.toUpperCase(),
            rates,
            supportedCurrencies: SUPPORTED_CURRENCIES,
            retrievedAt: new Date().toISOString(),
        };
    }
}
