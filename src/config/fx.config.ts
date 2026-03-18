import { registerAs } from '@nestjs/config';

export default registerAs('fx', () => ({
    apiKey: process.env.FX_API_KEY,
    baseUrl: process.env.FX_API_BASE_URL || 'https://v6.exchangerate-api.com/v6',
    cacheTtl: parseInt(process.env.FX_CACHE_TTL || '300', 10),
}));
