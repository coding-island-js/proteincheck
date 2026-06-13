import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ScanDto {
  @ApiProperty({ description: 'Food photo as a data URL or raw base64 (JPEG/PNG).' })
  @IsString()
  image!: string;

  @ApiPropertyOptional({ description: 'Optional email for follow-up.' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Anonymous session id for analytics.' })
  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class ProteinItem {
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Estimated grams of protein for this item.' })
  protein!: number;
}

export class ScanResult {
  @ApiProperty({ description: 'Total estimated grams of protein in the meal.' })
  totalProtein!: number;

  @ApiProperty({ type: [ProteinItem], description: 'Per-item protein breakdown.' })
  items!: ProteinItem[];

  @ApiProperty({ description: 'Short punchy verdict.' })
  verdict!: string;

  @ApiProperty({ description: 'One-sentence friendly summary.' })
  summary!: string;

  @ApiProperty({ description: 'Estimate confidence: high | medium | low.' })
  confidence!: string;
}
