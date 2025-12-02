import { Module, OnModuleInit } from '@nestjs/common';
import { ToolRegistry } from './registry/tool-registry.service';
import { TavilySearchProvider } from './providers/tavily-search.provider';
import { WebFetchProvider } from './providers/web-fetch.provider';
import { DuckDuckGoSearchProvider } from './providers/duckduckgo-search.provider';
import { BraveSearchProvider } from './providers/brave-search.provider';
import { SerpApiSearchProvider } from './providers/serpapi-search.provider';
import { KnowledgeSearchProvider } from './providers/knowledge-search.provider';
import { ITool } from './interfaces/tool.interface';
import { LoggingModule } from '../logging/logging.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [LoggingModule, KnowledgeModule],
  providers: [
    ToolRegistry,
    TavilySearchProvider,
    WebFetchProvider,
    DuckDuckGoSearchProvider,
    BraveSearchProvider,
    SerpApiSearchProvider,
    KnowledgeSearchProvider,
  ],
  exports: [
    ToolRegistry,
    TavilySearchProvider,
    WebFetchProvider,
    DuckDuckGoSearchProvider,
    KnowledgeSearchProvider,
  ],
})
export class ToolsModule implements OnModuleInit {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly tavilySearch: TavilySearchProvider,
    private readonly webFetch: WebFetchProvider,
    private readonly duckduckgoSearch: DuckDuckGoSearchProvider,
    private readonly braveSearch: BraveSearchProvider,
    private readonly serpapiSearch: SerpApiSearchProvider,
    private readonly knowledgeSearch: KnowledgeSearchProvider,
  ) {}

  onModuleInit() {
    // Register all tools with conditional logic
    this.tryRegisterProvider(this.tavilySearch, 'Tavily');
    this.tryRegisterProvider(this.webFetch, 'WebFetch');
    this.tryRegisterProvider(this.duckduckgoSearch, 'DuckDuckGo');
    this.tryRegisterProvider(this.braveSearch, 'Brave');
    this.tryRegisterProvider(this.serpapiSearch, 'SerpAPI');
    this.tryRegisterProvider(this.knowledgeSearch, 'Knowledge');

    this.logActiveProviders();
  }

  /**
   * Attempts to register a provider with the tool registry.
   * Only registers if:
   * - Provider doesn't require an API key, OR
   * - Provider has a valid API key configured
   */
  private tryRegisterProvider(provider: ITool, name: string): void {
    if (!provider.requiresApiKey || this.hasValidApiKey(provider, name)) {
      this.toolRegistry.register(provider);
      console.log(`[ToolsModule] Registered ${name} provider`);
    } else {
      console.log(`[ToolsModule] Skipped ${name} - no valid API key`);
    }
  }

  /**
   * Checks if a provider has a valid API key configured.
   * Assumes providers expose their API key via an 'apiKey' property.
   */
  private hasValidApiKey(provider: any, name: string): boolean {
    return provider.apiKey && provider.apiKey.length > 0;
  }

  /**
   * Logs all currently registered tools to the console.
   */
  private logActiveProviders(): void {
    const tools = this.toolRegistry.getAllTools();
    const toolNames = tools.map((t) => t.definition.function.name).join(', ');
    console.log(`[ToolsModule] Active tools: ${toolNames}`);
  }
}
