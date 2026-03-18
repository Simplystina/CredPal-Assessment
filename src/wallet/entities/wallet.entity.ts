// wallet.entity.ts — fix balance type to match TypeORM runtime reality
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    Unique,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('wallets')
@Unique(['userId', 'currency'])
export class Wallet {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ length: 10 })
    currency: string;

    @Column('decimal', { precision: 18, scale: 6, default: 0 })
    balance: string; 

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}