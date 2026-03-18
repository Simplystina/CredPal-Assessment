import {
    IsString,
    IsNumber,
    Min,
    IsIn,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SUPPORTED_CURRENCIES } from '../../common/constants';

export class FundWalletDto {
    @ApiProperty({
        example: 'NGN',
        description: `Currency to fund. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`,
    })
    @IsString()
    @IsIn(SUPPORTED_CURRENCIES, { message: 'Unsupported currency' })
    currency: string;

    @ApiProperty({ example: 10000, description: 'Amount to add to wallet' })
    @IsNumber()
    @Min(0.01, { message: 'Amount must be greater than 0' })
    amount: number;
}
