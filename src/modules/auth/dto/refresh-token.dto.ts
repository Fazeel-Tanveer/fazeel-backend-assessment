import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { REFRESH_TOKEN_MAX_LENGTH } from '../auth.constants.js';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token from the last sign-in or refresh',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(REFRESH_TOKEN_MAX_LENGTH)
  refreshToken: string;
}
