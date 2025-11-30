import {
  IsString,
  IsNotEmpty,
  IsISO8601,
  IsIn,
} from 'class-validator';

export class DeliveryEventDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['Pending', 'Shipped', 'Delivered', 'Cancelled'])
  status: string;

  @IsString()
  @IsISO8601()
  timestamp: string;
}

