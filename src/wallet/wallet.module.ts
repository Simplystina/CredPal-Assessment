import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { AuthModule } from '../auth/auth.module';
import { FxModule } from '../fx/fx.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Wallet]),
        AuthModule,
        FxModule,
        TransactionsModule,
    ],
    controllers: [WalletController],
    providers: [WalletService],
    exports: [WalletService],
})
export class WalletModule { }
