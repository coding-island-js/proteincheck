import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubscribeDto {
  @ApiProperty({ description: 'Email to notify about new features.' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ description: 'Where the signup came from (e.g. "result").' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;
}
