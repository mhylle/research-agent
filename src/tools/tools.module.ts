import { Module } from '@nestjs/common';
import { ToolRegistry } from './registry/tool-registry.service';
import { TavilySearchProvider } from './providers/tavily-search.provider';
import { WebFetchProvider } from './providers/web-fetch.provider';

@Module({
  providers: [ToolRegistry, TavilySearchProvider, WebFetchProvider],
  exports: [ToolRegistry, TavilySearchProvider, WebFetchProvider],
})
export class ToolsModule {}
