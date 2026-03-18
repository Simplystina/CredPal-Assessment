import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SUPPORTED_CURRENCIES } from '../../common/constants';

export class getRatesDto {
    @ApiProperty({ example: 'NGN' })
    @IsEnum(SUPPORTED_CURRENCIES)
    base: string;
}
