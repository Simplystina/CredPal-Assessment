export const SUPPORTED_CURRENCIES = [
    'NGN',
    'USD',
    'EUR',
    'GBP',
    'JPY',
    'CAD',
    'AUD',
    'CHF',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export enum UserRole {
    USER = 'user',
    ADMIN = 'admin',
}

export enum TransactionType {
    FUNDING = 'FUNDING',
    CONVERSION = 'CONVERSION',
    TRADE = 'TRADE',
}

export enum TransactionStatus {
    PENDING = 'PENDING',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
}
