import {
    Controller,
    Get,
    Post,
    Body,
    UseGuards,
    HttpCode,
    HttpStatus,
    Request,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { FundWalletDto } from './dto/fund-wallet.dto';
import { ConvertDto } from './dto/convert.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerifiedGuard } from '../auth/guards/verified.guard';

@ApiTags('Wallet')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, VerifiedGuard)
@Controller('wallet')
export class WalletController {
    constructor(private readonly walletService: WalletService) { }

    @Get()
    @ApiOperation({ summary: 'Get all wallet balances for the authenticated user' })
    @ApiResponse({
        status: 200,
        description: 'Returns all currency balances',
        schema: {
            example: {
                wallets: [
                    { id: 'uuid', currency: 'NGN', balance: 10000 },
                    { id: 'uuid', currency: 'USD', balance: 6.5 },
                ],
            },
        },
    })
    getWallets(@Request() req: any) {
        return this.walletService.getWallets(req.user.id);
    }

    @Post('fund')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Fund wallet with a specified currency and amount' })
    @ApiResponse({ status: 200, description: 'Wallet funded successfully' })
    fundWallet(@Request() req: any, @Body() dto: FundWalletDto) {
        return this.walletService.fundWallet(req.user.id, dto);
    }

    @Post('convert')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Convert between currencies using real-time FX rates',
    })
    @ApiResponse({ status: 200, description: 'Conversion successful' })
    convert(@Request() req: any, @Body() dto: ConvertDto) {
        return this.walletService.convert(req.user.id, dto);
    }

    @Post('trade')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Trade currencies (same as convert, recorded as TRADE type)',
    })
    @ApiResponse({ status: 200, description: 'Trade executed successfully' })
    trade(@Request() req: any, @Body() dto: ConvertDto) {
        return this.walletService.trade(req.user.id, dto);
    }
}
