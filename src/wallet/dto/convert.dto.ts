import {
    IsString,
    IsNumber,
    Min,
    IsIn,
    NotEquals,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SUPPORTED_CURRENCIES } from '../../common/constants';

export class ConvertDto {
    @ApiProperty({ example: 'NGN', description: 'Source currency' })
    @IsString()
    @IsIn(SUPPORTED_CURRENCIES, { message: 'Unsupported source currency' })
    fromCurrency: string;

    @ApiProperty({ example: 'USD', description: 'Target currency' })
    @IsString()
    @IsIn(SUPPORTED_CURRENCIES, { message: 'Unsupported target currency' })
    toCurrency: string;

    @ApiProperty({ example: 1000, description: 'Amount in source currency to convert' })
    @IsNumber()
    @Min(0.01, { message: 'Amount must be greater than 0' })
    amount: number;
}
