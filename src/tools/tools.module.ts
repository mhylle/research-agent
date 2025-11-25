import { Module, OnModuleInit } from '@nestjs/common';
import { ToolRegistry } from './registry/tool-registry.service';
import { TavilySearchProvider } from './providers/tavily-search.provider';
import { WebFetchProvider } from './providers/web-fetch.provider';

@Module({
  providers: [ToolRegistry, TavilySearchProvider, WebFetchProvider],
  exports: [ToolRegistry, TavilySearchProvider, WebFetchProvider],
})
export class ToolsModule implements OnModuleInit {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly tavilySearch: TavilySearchProvider,
    private readonly webFetch: WebFetchProvider,
  ) {}

  onModuleInit() {
    // Register all tools with the registry
    this.toolRegistry.register(this.tavilySearch);
    this.toolRegistry.register(this.webFetch);
  }
}
