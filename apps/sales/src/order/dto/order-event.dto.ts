import {
  IsString,
  IsArray,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  Min,
  ValidateNested,
  ArrayMinSize,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemEventDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  name?: string;
}

export class OrderEventDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemEventDto)
  items: OrderItemEventDto[];

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @IsISO8601()
  timestamp: string;

  @IsString()
  @IsNotEmpty()
  correlationId: string;
}

