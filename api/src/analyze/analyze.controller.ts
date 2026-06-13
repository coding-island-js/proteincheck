import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalyzeService } from './analyze.service';
import { ScanDto, ScanResult } from './dto';

@ApiTags('protein')
@Controller()
export class AnalyzeController {
  constructor(private readonly svc: AnalyzeService) {}

  @Get('health')
  health(): { ok: boolean } {
    return { ok: true };
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Estimate protein from a single food photo' })
  @ApiOkResponse({ type: ScanResult })
  analyze(@Body() dto: ScanDto): Promise<ScanResult> {
    return this.svc.analyze(dto);
  }
}
