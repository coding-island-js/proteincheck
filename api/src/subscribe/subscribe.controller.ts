import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SubscribeDto } from './dto';
import { SubscribeService } from './subscribe.service';

@ApiTags('subscribe')
@Controller('subscribe')
export class SubscribeController {
  constructor(private readonly service: SubscribeService) {}

  @Post()
  subscribe(@Body() dto: SubscribeDto): Promise<{ ok: boolean }> {
    return this.service.subscribe(dto);
  }
}
