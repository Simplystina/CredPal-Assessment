import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        HttpModule,
        ConfigModule,
        AuthModule,
    ],
    controllers: [FxController],
    providers: [FxService],
    exports: [FxService],
})
export class FxModule { }
