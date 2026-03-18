import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { FxService } from './fx.service';
import { of, throwError } from 'rxjs';

const mockHttpService = () => ({
    get: jest.fn(),
});

const mockCacheManager = () => ({
    get: jest.fn(),
    set: jest.fn(),
});

const mockConfigService = {
    get: jest.fn((key: string) => {
        const config: Record<string, unknown> = {
            'fx.apiKey': 'test-api-key',
            'fx.baseUrl': 'https://v6.exchangerate-api.com/v6',
            'fx.cacheTtl': 300,
        };
        return config[key];
    }),
};

const mockApiResponse = {
    data: {
        result: 'success',
        base_code: 'NGN',
        conversion_rates: {
            NGN: 1,
            USD: 0.00065,
            EUR: 0.00060,
            GBP: 0.00051,
            JPY: 0.098,
            CAD: 0.00088,
            AUD: 0.00099,
            CHF: 0.00058,
        },
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {},
};

describe('FxService', () => {
    let service: FxService;
    let httpService: ReturnType<typeof mockHttpService>;
    let cacheManager: ReturnType<typeof mockCacheManager>;

    beforeEach(async () => {
        jest.useFakeTimers();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FxService,
                { provide: HttpService, useFactory: mockHttpService },
                { provide: CACHE_MANAGER, useFactory: mockCacheManager },
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        service = module.get<FxService>(FxService);
        httpService = module.get(HttpService);
        cacheManager = module.get(CACHE_MANAGER);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('getRates', () => {
        it('should fetch from API and cache rates (both fresh and stale) on cache miss', async () => {
            cacheManager.get.mockResolvedValue(null); // cache miss
            (httpService.get as jest.Mock).mockReturnValue(of(mockApiResponse));
            cacheManager.set.mockResolvedValue(undefined);

            const ratesPromise = service.getRates('NGN');
            const rates = await ratesPromise;

            expect(rates).toHaveProperty('USD');
            expect(rates.USD).toBe(0.00065);
            expect(httpService.get).toHaveBeenCalledTimes(1);
            // Should call set twice: once for the fresh cache, once for the stale backup
            expect(cacheManager.set).toHaveBeenCalledTimes(2);
        });

        it('should return cached rates without calling the API on cache hit', async () => {
            const cachedRates = { USD: 0.00065, EUR: 0.00060 };
            cacheManager.get.mockResolvedValue(cachedRates); // cache hit

            const rates = await service.getRates('NGN');

            expect(rates).toEqual(cachedRates);
            expect(httpService.get).not.toHaveBeenCalled();
        });

        it('should throw ServiceUnavailableException when API call fails and no stale cache', async () => {
            cacheManager.get.mockResolvedValue(null); // fresh cache miss
            (httpService.get as jest.Mock).mockReturnValue(
                throwError(() => new Error('Network error')),
            );

            const promise = service.getRates('NGN');

            // Advance timers to handle retries and flush microtasks
            for (let i = 0; i < 4; i++) {
                jest.advanceTimersByTime(10000);
                await Promise.resolve();
            }

            await expect(promise).rejects.toThrow(ServiceUnavailableException);
        });

        it('should return stale rates when API fails and stale cache exists', async () => {
            const staleRates = { USD: 0.00060 };
            cacheManager.get.mockImplementation((key) => {
                if (key.includes('stale')) return Promise.resolve(staleRates);
                return Promise.resolve(null);
            });

            (httpService.get as jest.Mock).mockReturnValue(
                throwError(() => new Error('Network error')),
            );

            const promise = service.getRates('NGN');

            // Handle retries
            for (let i = 0; i < 4; i++) {
                jest.advanceTimersByTime(10000);
                await Promise.resolve();
            }

            const result = await promise;
            expect(result).toEqual(staleRates);
        });
    });

    describe('getRate', () => {
        it('should return 1 when from and to currencies are the same', async () => {
            const rate = await service.getRate('NGN', 'NGN');
            expect(rate).toBe(1);
            expect(httpService.get).not.toHaveBeenCalled();
        });

        it('should return the correct exchange rate', async () => {
            cacheManager.get.mockResolvedValue(null);
            (httpService.get as jest.Mock).mockReturnValue(of(mockApiResponse));
            cacheManager.set.mockResolvedValue(undefined);

            const rate = await service.getRate('NGN', 'USD');
            expect(rate).toBe(0.00065);
        });
    });
});
