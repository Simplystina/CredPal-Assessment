import {
    IsNumber,
    IsOptional,
    IsString,
    Min,
    IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TransactionType } from '../../common/constants';

export class QueryTransactionsDto {
    @ApiPropertyOptional({ example: 1, description: 'Page number' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ example: 20, description: 'Items per page (max 100)' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    limit?: number = 20;

    @ApiPropertyOptional({
        enum: TransactionType,
        example: TransactionType.CONVERSION,
        description: 'Filter by transaction type',
    })
    @IsOptional()
    @IsString()
    @IsIn(Object.values(TransactionType))
    type?: TransactionType;

    @ApiPropertyOptional({ example: 'NGN', description: 'Filter by currency' })
    @IsOptional()
    @IsString()
    currency?: string;
}
