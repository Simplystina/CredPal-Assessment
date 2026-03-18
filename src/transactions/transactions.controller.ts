import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerifiedGuard } from '../auth/guards/verified.guard';

@ApiTags('Transactions')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, VerifiedGuard)
@Controller('transactions')
export class TransactionsController {
    constructor(private readonly transactionsService: TransactionsService) { }

    @Get()
    @ApiOperation({
        summary: 'Get transaction history for the authenticated user',
    })
    @ApiResponse({
        status: 200,
        description: 'Transaction history retrieved',
    })
    getTransactions(
        @Request() req: any,
        @Query() query: QueryTransactionsDto,
    ) {
        return this.transactionsService.getUserTransactions(req.user.id, query);
    }
}
