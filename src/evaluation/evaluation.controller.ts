import { Controller, Get } from '@nestjs/common';

@Controller('api/evaluation')
export class EvaluationController {
  @Get('health')
  health() {
    return { status: 'ok', module: 'evaluation' };
  }
}
