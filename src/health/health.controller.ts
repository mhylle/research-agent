import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMService } from '../llm/llm.service';

interface HealthResponse {
  status: 'healthy' | 'degraded';
  services: {
    llm: boolean;
    llmProvider: string;
    tavily: boolean;
  };
}

@Controller('api/health')
export class HealthController {
  constructor(
    private llmService: LLMService,
    private configService: ConfigService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const llmAvailable = await this.checkLLM();
    const services = {
      llm: llmAvailable,
      llmProvider: this.llmService.getProviderName(),
      tavily: this.checkTavily(),
    };

    const status = llmAvailable && services.tavily ? 'healthy' : 'degraded';

    return { status, services };
  }

  private async checkLLM(): Promise<boolean> {
    return this.llmService.isAvailable();
  }

  private checkTavily(): boolean {
    const apiKey = this.configService.get<string>('TAVILY_API_KEY');
    return apiKey && apiKey !== 'your_api_key_here' ? true : false;
  }
}
