import {
    Injectable,
    Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Transaction } from './entities/transaction.entity';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import {
    TransactionType,
    TransactionStatus,
} from '../common/constants';

export interface CreateTransactionDto {
    userId: string;
    type: TransactionType;
    fromCurrency?: string;
    toCurrency?: string;
    fromAmount: number;
    toAmount?: number;
    rate?: number;
    status?: TransactionStatus;
    metadata?: Record<string, unknown>;
}

@Injectable()
export class TransactionsService {
    private readonly logger = new Logger(TransactionsService.name);

    constructor(
        @InjectRepository(Transaction)
        private readonly transactionRepository: Repository<Transaction>,
    ) { }

    async createTransaction(data: CreateTransactionDto): Promise<Transaction> {
        const transaction = this.transactionRepository.create({
            ...data,
            toAmount: data.toAmount ?? 0,
            status: data.status ?? TransactionStatus.SUCCESS,
            reference: uuidv4(),
        });
        return this.transactionRepository.save(transaction);
    }

    async getUserTransactions(userId: string, query: QueryTransactionsDto) {
        const { page = 1, limit = 20, type, currency } = query;
        const safePage = Math.max(1, page);
        const safeLimit = Math.min(100, Math.max(1, limit));

        const qb = this.transactionRepository
            .createQueryBuilder('tx')
            .where('tx.userId = :userId', { userId })
            .orderBy('tx.createdAt', 'DESC')
            .skip((safePage - 1) * safeLimit)
            .take(safeLimit);

        if (type) {
            qb.andWhere('tx.type = :type', { type });
        }

        if (currency) {
            qb.andWhere(
                '(tx.fromCurrency = :currency OR tx.toCurrency = :currency)',
                { currency: currency.toUpperCase() },
            );
        }

        const [transactions, total] = await qb.getManyAndCount();

        return {
            transactions,
            pagination: {
                total,
                page: safePage,
                limit: safeLimit,
                totalPages: Math.ceil(total / safeLimit),
            },
        };
    }
   
    async createTransactionWithManager(
        manager: EntityManager,
        dto: CreateTransactionDto,
    ) {
        const transaction = manager.getRepository(Transaction).create({
            ...dto,
            reference: uuidv4(), 
        });
        return manager.getRepository(Transaction).save(transaction);
    }
}
