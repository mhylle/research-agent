import { Module } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { OllamaProvider } from './providers/ollama.provider';
import { AzureMistralProvider } from './providers/azure-mistral.provider';
import { LLMProviderFactory } from './llm-provider.factory';
import { LLMService } from './llm.service';

@Module({
  providers: [
    // Legacy service (maintained for backward compatibility)
    OllamaService,
    // New provider implementations
    OllamaProvider,
    AzureMistralProvider,
    // Provider factory for runtime selection
    LLMProviderFactory,
    // Provider-agnostic facade
    LLMService,
  ],
  exports: [
    // Export both for migration support
    OllamaService, // Legacy - consumers should migrate to LLMService
    LLMService, // New - provider-agnostic facade
    LLMProviderFactory, // For consumers that need explicit provider selection
  ],
})
export class LLMModule {}
