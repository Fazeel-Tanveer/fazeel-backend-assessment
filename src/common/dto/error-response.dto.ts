import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Order not found',
    description: 'A list when several validation rules failed',
  })
  message: string | string[];

  @ApiProperty({ example: 'Not Found' })
  error: string;
}
