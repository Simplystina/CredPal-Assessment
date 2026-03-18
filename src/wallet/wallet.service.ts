import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Logger,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Decimal } from 'decimal.js';
import { Wallet } from './entities/wallet.entity';
import { FxService } from '../fx/fx.service';
import { TransactionsService } from '../transactions/transactions.service';
import { FundWalletDto } from './dto/fund-wallet.dto';
import { ConvertDto } from './dto/convert.dto';
import { TransactionType } from '../common/constants';

@Injectable()
export class WalletService {
    private readonly logger = new Logger(WalletService.name);

    constructor(
        @InjectRepository(Wallet)
        private readonly walletDb: Repository<Wallet>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly fxService: FxService,
        private readonly transactionsService: TransactionsService,
    ) {
        // Configure Decimal for financial precision
        Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
    }

    async getWallets(userId: string) {
        const wallets = await this.walletDb.find({
            where: { userId },
            order: { currency: 'ASC' },
        });
        return { wallets };
    }

    async fundWallet(userId: string, dto: FundWalletDto) {
        const currency = dto.currency.toUpperCase();
        const amount = new Decimal(dto.amount);

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const manager = queryRunner.manager;
            const wallet = await this.lockWalletOrCreate(manager, userId, currency);

            const previousBalance = new Decimal(wallet.balance);
            const newBalance = previousBalance.plus(amount);

            wallet.balance = newBalance.toFixed(6);
            await manager.getRepository(Wallet).save(wallet);

            const transaction = await this.transactionsService.createTransactionWithManager(
                manager,
                {
                    userId,
                    type: TransactionType.FUNDING,
                    fromCurrency: currency,
                    toCurrency: currency,
                    fromAmount: dto.amount,
                    toAmount: dto.amount,
                    metadata: {
                        previousBalance: previousBalance.toFixed(6),
                        newBalance: wallet.balance,
                    },
                },
            );

            await queryRunner.commitTransaction();

            return {
                message: `Wallet funded successfully`,
                currency,
                amountAdded: dto.amount,
                newBalance: wallet.balance,
                transactionReference: transaction.reference,
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('fundWallet failed', error);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async convert(
        userId: string,
        dto: ConvertDto,
        type = TransactionType.CONVERSION,
    ) {
        const fromCurrency = dto.fromCurrency.toUpperCase();
        const toCurrency = dto.toCurrency.toUpperCase();

        if (fromCurrency === toCurrency) {
            throw new BadRequestException(
                'Source and target currencies must be different',
            );
        }

        const rate = await this.fxService.getRate(fromCurrency, toCurrency);
        const amount = new Decimal(dto.amount);
        const convertedAmount = amount.mul(new Decimal(rate)).toDecimalPlaces(6);

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const manager = queryRunner.manager;

            // Canonical locking to avoid deadlocks
            const [firstCurrency, secondCurrency] = [fromCurrency, toCurrency].sort();

            const firstWallet = await this.lockWalletOrCreate(manager, userId, firstCurrency);
            const secondWallet = await this.lockWalletOrCreate(manager, userId, secondCurrency);

            const sourceWallet = fromCurrency === firstCurrency ? firstWallet : secondWallet;
            const targetWallet = fromCurrency === firstCurrency ? secondWallet : firstWallet;

            // Check if source wallet actually existed in DB (id will be present)
            if (!sourceWallet.id) {
                throw new NotFoundException(
                    `No ${fromCurrency} wallet found. Please fund your wallet first.`,
                );
            }

            const sourceBalance = new Decimal(sourceWallet.balance);
            if (sourceBalance.lt(amount)) {
                throw new BadRequestException(
                    `Insufficient ${fromCurrency} balance. ` +
                    `Available: ${sourceBalance.toFixed(2)}, Required: ${amount.toFixed(2)}`,
                );
            }

            // Update balances
            sourceWallet.balance = sourceBalance.minus(amount).toFixed(6);
            await manager.getRepository(Wallet).save(sourceWallet);

            const targetBalance = new Decimal(targetWallet.balance);
            targetWallet.balance = targetBalance.plus(convertedAmount).toFixed(6);
            await manager.getRepository(Wallet).save(targetWallet);

            const transaction = await this.transactionsService.createTransactionWithManager(
                manager,
                {
                    userId,
                    type,
                    fromCurrency,
                    toCurrency,
                    fromAmount: amount.toNumber(),
                    toAmount: convertedAmount.toNumber(),
                    rate,
                    metadata: {
                        sourceWalletId: sourceWallet.id,
                        targetWalletId: targetWallet.id,
                    },
                },
            );

            await queryRunner.commitTransaction();

            return {
                message: `Successfully converted ${amount.toFixed(2)} ${fromCurrency} to ${toCurrency}`,
                fromCurrency,
                toCurrency,
                fromAmount: amount.toNumber(),
                toAmount: convertedAmount.toNumber(),
                rate,
                sourceNewBalance: sourceWallet.balance,
                targetNewBalance: targetWallet.balance,
                transactionReference: transaction.reference,
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('convert failed', error);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async trade(userId: string, dto: ConvertDto) {
        // Trade is semantically the same as convert; stored with TRADE type for auditing
        return this.convert(userId, dto, TransactionType.TRADE);
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    /** Lock an existing wallet row for update. Returns null if not found. */
    private async lockWallet(
        manager: EntityManager,
        userId: string,
        currency: string,
    ): Promise<Wallet | null> {
        return manager.getRepository(Wallet).findOne({
            where: { userId, currency },
            lock: { mode: 'pessimistic_write' },
        });
    }

    /** Lock wallet if it exists, or create a zero-balance one in memory (not yet saved). */
    private async lockWalletOrCreate(
        manager: EntityManager,
        userId: string,
        currency: string,
    ): Promise<Wallet> {
        const existing = await this.lockWallet(manager, userId, currency);
        if (existing) return existing;

        return manager.getRepository(Wallet).create({
            userId,
            currency,
            balance: '0',
        });
    }
}