import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILLMProvider } from './interfaces/llm-provider.interface';
import { OllamaProvider } from './providers/ollama.provider';
import { AzureMistralProvider } from './providers/azure-mistral.provider';
import { LocalLLMProvider } from './providers/local.provider';

/**
 * Supported LLM provider types.
 */
export type LLMProviderType = 'ollama' | 'azure-mistral' | 'local';

/**
 * Factory for creating LLM provider instances based on configuration.
 * Enables runtime switching between different LLM providers.
 */
@Injectable()
export class LLMProviderFactory {
  constructor(
    private configService: ConfigService,
    private ollamaProvider: OllamaProvider,
    private azureMistralProvider: AzureMistralProvider,
    private localProvider: LocalLLMProvider,
  ) {}

  /**
   * Get the configured LLM provider.
   * Defaults to Ollama if LLM_PROVIDER is not set or invalid.
   */
  getProvider(): ILLMProvider {
    const providerName = this.configService.get<string>('LLM_PROVIDER');

    return this.getProviderByName(providerName);
  }

  /**
   * Get a specific provider by name.
   * Useful for testing or explicit provider selection.
   */
  getProviderByName(providerName?: string): ILLMProvider {
    switch (providerName?.toLowerCase()) {
      case 'azure-mistral':
      case 'azure':
        return this.azureMistralProvider;
      case 'local':
        return this.localProvider;
      case 'ollama':
      default:
        return this.ollamaProvider;
    }
  }

  /**
   * Get list of available provider names.
   */
  getAvailableProviders(): LLMProviderType[] {
    return ['ollama', 'azure-mistral'];
  }

  /**
   * Check if a provider is available and configured.
   */
  isProviderAvailable(providerName: LLMProviderType): boolean {
    switch (providerName) {
      case 'azure-mistral': {
        const endpoint = this.configService.get<string>(
          'AZURE_OPENAI_ENDPOINT',
        );
        const apiKey = this.configService.get<string>('AZURE_OPENAI_API_KEY');
        return !!(endpoint && apiKey);
      }
      case 'ollama':
        // Ollama is always available (uses defaults if not configured)
        return true;
      default:
        return false;
    }
  }
}
