import { ApiProperty } from '@nestjs/swagger';
import { IsByteLength, IsNotEmpty, IsString } from 'class-validator';
import { PASSWORD_MAX_BYTES } from '../auth.constants.js';
import { IsIdentifier } from './is-identifier.decorator.js';

export class LoginDto {
  @IsIdentifier()
  identifier: string;

  @ApiProperty({ example: 'secret123' })
  @IsString()
  @IsNotEmpty()
  @IsByteLength(0, PASSWORD_MAX_BYTES)
  password: string;
}
