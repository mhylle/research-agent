import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LLMService } from './llm.service';
import { OllamaAdapter } from './adapters/ollama.adapter';
import { AzureOpenAIAdapter } from './adapters/azure-openai.adapter';

@Module({
  imports: [ConfigModule],
  providers: [LLMService, OllamaAdapter, AzureOpenAIAdapter],
  exports: [LLMService],
})
export class LLMModule {}
