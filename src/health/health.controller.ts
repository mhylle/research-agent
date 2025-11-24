import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OllamaService } from '../llm/ollama.service';

interface HealthResponse {
  status: 'healthy' | 'degraded';
  services: {
    ollama: boolean;
    tavily: boolean;
  };
}

@Controller('api/health')
export class HealthController {
  constructor(
    private ollamaService: OllamaService,
    private configService: ConfigService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const services = {
      ollama: await this.checkOllama(),
      tavily: this.checkTavily(),
    };

    const status = Object.values(services).every((s) => s)
      ? 'healthy'
      : 'degraded';

    return { status, services };
  }

  private async checkOllama(): Promise<boolean> {
    try {
      await this.ollamaService.chat([
        { role: 'user', content: 'health check' },
      ]);
      return true;
    } catch {
      return false;
    }
  }

  private checkTavily(): boolean {
    const apiKey = this.configService.get<string>('TAVILY_API_KEY');
    return apiKey && apiKey !== 'your_api_key_here' ? true : false;
  }
}
