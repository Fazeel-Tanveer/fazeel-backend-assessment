import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsByteLength,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  E164_PHONE_PATTERN,
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_DIGIT_PATTERN,
  PASSWORD_LETTER_PATTERN,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
} from '../auth.constants.js';
import { trim, trimAndLowercase } from '../../../common/dto/transforms.js';

export class RegisterDto {
  @ApiProperty({ example: 'Alice', maxLength: NAME_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  name: string;

  @ApiProperty({ example: 'alice@example.com', maxLength: EMAIL_MAX_LENGTH })
  @Transform(trimAndLowercase)
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;

  @ApiProperty({ example: '+15551234567', description: 'E.164 format' })
  @Transform(trim)
  @Matches(E164_PHONE_PATTERN, {
    message: 'phone must be in E.164 format, e.g. +15551234567',
  })
  phone: string;

  @ApiProperty({
    example: 'secret123',
    minLength: PASSWORD_MIN_LENGTH,
    description: `At least one letter and one number, up to ${PASSWORD_MAX_BYTES} bytes`,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @IsByteLength(0, PASSWORD_MAX_BYTES)
  @Matches(PASSWORD_LETTER_PATTERN, {
    message: 'password must contain a letter',
  })
  @Matches(PASSWORD_DIGIT_PATTERN, {
    message: 'password must contain a number',
  })
  password: string;
}
