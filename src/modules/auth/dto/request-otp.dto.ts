import { IsIdentifier } from './is-identifier.decorator.js';

export class RequestOtpDto {
  @IsIdentifier()
  identifier: string;
}
