import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import {
    TransactionType,
    TransactionStatus,
} from '../../common/constants';

@Entity('transactions')
export class Transaction {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ type: 'enum', enum: TransactionType })
    type: TransactionType;

    @Column({ nullable: true })
    fromCurrency: string;

    @Column({ nullable: true })
    toCurrency: string;

    @Column('decimal', { precision: 18, scale: 6 })
    fromAmount: number;

    @Column('decimal', { precision: 18, scale: 6, default: 0 })
    toAmount: number;

    @Column('decimal', { precision: 18, scale: 8, nullable: true })
    rate: number;

    @Column({
        type: 'enum',
        enum: TransactionStatus,
        default: TransactionStatus.SUCCESS,
    })
    status: TransactionStatus;

    @Column({ unique: true })
    reference: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, unknown>;

    @CreateDateColumn()
    createdAt: Date;
}
