import {
    Injectable,
    ServiceUnavailableException,
    Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { firstValueFrom, retry, timer } from 'rxjs';
import { SUPPORTED_CURRENCIES } from '../common/constants';

interface ExchangeRateApiResponse {
    result: string;
    base_code: string;
    conversion_rates: Record<string, number>;
}

@Injectable()
export class FxService {
    private readonly logger = new Logger(FxService.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    ) { }

    async getRates(baseCurrency: string = 'NGN'): Promise<Record<string, number>> {
        const cacheKey = `fx:rates:${baseCurrency.toUpperCase()}`;
        const staleCacheKey = `fx:rates:stale:${baseCurrency.toUpperCase()}`;

        // Try to get from fresh cache first
        const cached = await this.cacheManager.get<Record<string, number>>(cacheKey);
        if (cached) {
            this.logger.debug(`FX rates for ${baseCurrency}gotten from cache`);
            return cached;
        }

        // If cache fails, fetch from external API with Exponential Backoff
        try {
            const apiKey = this.configService.get<string>('fx.apiKey');
            const baseUrl = this.configService.get<string>('fx.baseUrl');
            const url = `${baseUrl}/${apiKey}/latest/${baseCurrency.toUpperCase()}`;

            const response = await firstValueFrom(
                this.httpService.get<ExchangeRateApiResponse>(url, { timeout: 5000 }).pipe(
                    retry({
                        count: 3,
                        delay: (error, retryCount) => {
                            const wait = Math.pow(2, retryCount) * 1000;
                            this.logger.warn(`FX API call failed. Retrying in ${wait}ms... (Attempt ${retryCount})`);
                            return timer(wait);
                        },
                    }),
                ),
            );

            if (response.data.result !== 'success') {
                throw new Error(`FX API returned result: ${response.data.result}`);
            }

            // Filter to only supported currencies
            const rates: Record<string, number> = {};
            for (const currency of SUPPORTED_CURRENCIES) {
                if (response.data.conversion_rates[currency] !== undefined) {
                    rates[currency] = response.data.conversion_rates[currency];
                }
            }

            // Cache the result (Fresh + Stale backup)
            const cacheTtl = this.configService.get<number>('fx.cacheTtl') || 300;
            await this.cacheManager.set(cacheKey, rates, cacheTtl * 1000);

            // Store a "stale" version with a longer TTL (24h) as a fallback
            await this.cacheManager.set(staleCacheKey, rates, 24 * 60 * 60 * 1000);

            this.logger.debug(`FX rates for ${baseCurrency} fetched from API and cached`);
            return rates;
        } catch (error) {
            this.logger.error(
                `Failed to fetch FX rates for ${baseCurrency} after retries: ${(error as Error).message}`,
            );

            // Graceful Fallback: Try to use stale data if API is down
            const staleRates = await this.cacheManager.get<Record<string, number>>(staleCacheKey);
            if (staleRates) {
                this.logger.warn(`Using stale FX rates for ${baseCurrency} as fallback`);
                return staleRates;
            }

            throw new ServiceUnavailableException(
                'FX rate service is temporarily unavailable and no fallback data is available.',
            );
        }
    }

    async getRate(fromCurrency: string, toCurrency: string): Promise<number> {
        if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) return 1;

        const rates = await this.getRates(fromCurrency.toUpperCase());
        const rate = rates[toCurrency.toUpperCase()];

        if (!rate) {
            throw new ServiceUnavailableException(
                `Exchange rate for ${fromCurrency}→${toCurrency} is currently unavailable`,
            );
        }

        return rate;
    }
}
