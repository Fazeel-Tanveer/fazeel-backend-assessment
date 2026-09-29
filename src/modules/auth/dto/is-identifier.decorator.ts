import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { EMAIL_MAX_LENGTH } from '../auth.constants.js';
import { trimAndLowercase } from '../../../common/dto/transforms.js';

export function IsIdentifier() {
  return applyDecorators(
    ApiProperty({
      example: 'alice@example.com',
      description: 'Email or E.164 phone number',
    }),
    Transform(trimAndLowercase),
    IsString(),
    IsNotEmpty(),
    MaxLength(EMAIL_MAX_LENGTH),
  );
}
