import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { FxService } from '../fx/fx.service';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionType } from '../common/constants';

const mockWalletRepository = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
});

const mockFxService = () => ({
    getRate: jest.fn(),
});

const mockTransactionsService = () => ({
    createTransactionWithManager: jest.fn().mockResolvedValue({ reference: 'test-ref' }),
});

// Mock QueryRunner
const createMockQueryRunner = (wallets: Record<string, Wallet | null>) => ({
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
        getRepository: jest.fn(() => ({
            findOne: jest.fn(({ where }) => {
                const key = `${where.userId}-${where.currency}`;
                const wallet = wallets[key];
                return Promise.resolve(wallet ? { ...wallet } : null);
            }),
            create: jest.fn((data) => ({ ...data })), // No ID for new wallets
            save: jest.fn((entity) => {
                if (!entity.id) entity.id = 'new-wallet-id'; // Assign ID only on save
                return Promise.resolve(entity);
            }),
        })),
    },
});

const mockDataSource = (queryRunner: ReturnType<typeof createMockQueryRunner>) => ({
    createQueryRunner: jest.fn(() => queryRunner),
});

describe('WalletService', () => {
    let service: WalletService;
    let fxService: ReturnType<typeof mockFxService>;
    let transactionsService: ReturnType<typeof mockTransactionsService>;
    let walletRepo: ReturnType<typeof mockWalletRepository>;

    const buildModule = async (dataSourceOverride: object) => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WalletService,
                { provide: getRepositoryToken(Wallet), useFactory: mockWalletRepository },
                { provide: getDataSourceToken(), useValue: dataSourceOverride },
                { provide: FxService, useFactory: mockFxService },
                { provide: TransactionsService, useFactory: mockTransactionsService },
            ],
        }).compile();

        service = module.get<WalletService>(WalletService);
        fxService = module.get(FxService);
        transactionsService = module.get(TransactionsService);
        walletRepo = module.get(getRepositoryToken(Wallet));

        // Use any to bypass private property access for testing
        (service as any).walletDb = walletRepo;
    };

    describe('getWallets', () => {
        it('should return all wallets for a user', async () => {
            const qr = createMockQueryRunner({});
            await buildModule(mockDataSource(qr));

            walletRepo.find.mockResolvedValue([
                { id: '1', userId: 'user-1', currency: 'NGN', balance: '10000.000000' },
                { id: '2', userId: 'user-1', currency: 'USD', balance: '6.500000' },
            ]);

            const result = await service.getWallets('user-1');
            expect(result.wallets).toHaveLength(2);
        });
    });

    describe('fundWallet', () => {
        it('should increase balance and create a FUNDING transaction', async () => {
            const existingWallet: Wallet = { id: 'w-1', userId: 'user-1', currency: 'NGN', balance: '5000.000000' } as Wallet;
            const qr = createMockQueryRunner({ 'user-1-NGN': existingWallet });
            await buildModule(mockDataSource(qr));

            const result = await service.fundWallet('user-1', {
                currency: 'NGN',
                amount: 1000,
            });

            expect(result.amountAdded).toBe(1000);
            expect(result.newBalance).toBe('6000.000000');
            expect(result.transactionReference).toBe('test-ref');
        });

        it('should create a new wallet if one does not exist for the currency', async () => {
            const qr = createMockQueryRunner({}); // no existing wallet
            await buildModule(mockDataSource(qr));

            const result = await service.fundWallet('user-1', {
                currency: 'USD',
                amount: 500,
            });

            expect(result.amountAdded).toBe(500);
            expect(result.newBalance).toBe('500.000000');
        });
    });

    describe('convert', () => {
        it('should deduct from source and credit target at the correct rate', async () => {
            const sourceWallet: Wallet = { id: 'w-ngn', userId: 'u1', currency: 'NGN', balance: '10000.000000' } as Wallet;
            const targetWallet: Wallet = { id: 'w-usd', userId: 'u1', currency: 'USD', balance: '0.000000' } as Wallet;

            const qr = createMockQueryRunner({
                'u1-NGN': sourceWallet,
                'u1-USD': targetWallet,
            });
            await buildModule(mockDataSource(qr));

            (fxService.getRate as jest.Mock).mockResolvedValue(0.00065);

            const result = await service.convert('u1', {
                fromCurrency: 'NGN',
                toCurrency: 'USD',
                amount: 1000,
            });

            expect(result.fromAmount).toBe(1000);
            expect(result.toAmount).toBe(0.65);
            expect(result.rate).toBe(0.00065);
            expect(result.sourceNewBalance).toBe('9000.000000');
            expect(result.targetNewBalance).toBe('0.650000');
        });

        it('should throw BadRequestException for insufficient balance', async () => {
            const sourceWallet: Wallet = { id: 'w-ngn', userId: 'u1', currency: 'NGN', balance: '100.000000' } as Wallet;
            const qr = createMockQueryRunner({ 'u1-NGN': sourceWallet });
            await buildModule(mockDataSource(qr));

            (fxService.getRate as jest.Mock).mockResolvedValue(0.00065);

            await expect(
                service.convert('u1', {
                    fromCurrency: 'NGN',
                    toCurrency: 'USD',
                    amount: 5000, // more than balance of 100
                }),
            ).rejects.toThrow(BadRequestException);
        });

        it('should throw NotFoundException when source wallet does not exist', async () => {
            const qr = createMockQueryRunner({}); // no wallets
            await buildModule(mockDataSource(qr));

            (fxService.getRate as jest.Mock).mockResolvedValue(0.00065);

            await expect(
                service.convert('u1', {
                    fromCurrency: 'NGN',
                    toCurrency: 'USD',
                    amount: 1000,
                }),
            ).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException when from and to currency are the same', async () => {
            const qr = createMockQueryRunner({});
            await buildModule(mockDataSource(qr));

            await expect(
                service.convert('u1', {
                    fromCurrency: 'NGN',
                    toCurrency: 'NGN',
                    amount: 100,
                }),
            ).rejects.toThrow(BadRequestException);
        });

        it('should create a CONVERSION transaction record', async () => {
            const sourceWallet: Wallet = { id: 'w-ngn', userId: 'u1', currency: 'NGN', balance: '10000.000000' } as Wallet;
            const targetWallet: Wallet = { id: 'w-usd', userId: 'u1', currency: 'USD', balance: '0.000000' } as Wallet;

            const qr = createMockQueryRunner({ 'u1-NGN': sourceWallet, 'u1-USD': targetWallet });
            await buildModule(mockDataSource(qr));

            (fxService.getRate as jest.Mock).mockResolvedValue(0.00065);

            await service.convert('u1', {
                fromCurrency: 'NGN',
                toCurrency: 'USD',
                amount: 1000,
            });

            expect(transactionsService.createTransactionWithManager).toHaveBeenCalled();
        });

        it('trade() should record a TRADE transaction type', async () => {
            const sourceWallet: Wallet = { id: 'w-ngn', userId: 'u1', currency: 'NGN', balance: '10000.000000' } as Wallet;
            const targetWallet: Wallet = { id: 'w-usd', userId: 'u1', currency: 'USD', balance: '0.000000' } as Wallet;

            const qr = createMockQueryRunner({ 'u1-NGN': sourceWallet, 'u1-USD': targetWallet });
            await buildModule(mockDataSource(qr));

            (fxService.getRate as jest.Mock).mockResolvedValue(0.00065);

            await service.trade('u1', {
                fromCurrency: 'NGN',
                toCurrency: 'USD',
                amount: 1000,
            });

            expect(transactionsService.createTransactionWithManager).toHaveBeenCalled();
        });
    });
});
