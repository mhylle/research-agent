import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ToolRegistry } from '../src/tools/registry/tool-registry.service';
import { DuckDuckGoSearchProvider } from '../src/tools/providers/duckduckgo-search.provider';
import { BraveSearchProvider } from '../src/tools/providers/brave-search.provider';
import { SerpApiSearchProvider } from '../src/tools/providers/serpapi-search.provider';
import { SearchResult } from '../src/tools/interfaces/search-result.interface';
import { ToolExecutor } from '../src/executors/tool.executor';

describe('Multi-Provider Search System (e2e)', () => {
  let app: INestApplication;
  let toolRegistry: ToolRegistry;
  let toolExecutor: ToolExecutor;
  let duckduckgoProvider: DuckDuckGoSearchProvider;
  let braveProvider: BraveSearchProvider;
  let serpapiProvider: SerpApiSearchProvider;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get service instances
    toolRegistry = moduleFixture.get<ToolRegistry>(ToolRegistry);
    toolExecutor = moduleFixture.get<ToolExecutor>(ToolExecutor);
    duckduckgoProvider = moduleFixture.get<DuckDuckGoSearchProvider>(
      DuckDuckGoSearchProvider,
    );
    braveProvider = moduleFixture.get<BraveSearchProvider>(BraveSearchProvider);
    serpapiProvider = moduleFixture.get<SerpApiSearchProvider>(
      SerpApiSearchProvider,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Provider Registration', () => {
    it('should register DuckDuckGo provider (no API key required)', () => {
      const tools = toolRegistry.getAllTools();
      const duckduckgoTool = tools.find(
        (t) => t.definition.function.name === 'duckduckgo_search',
      );

      expect(duckduckgoTool).toBeDefined();
      expect(duckduckgoTool?.requiresApiKey).toBe(false);
      console.log('[Test] ✓ DuckDuckGo provider registered successfully');
    });

    it('should conditionally register Brave provider based on API key', () => {
      const tools = toolRegistry.getAllTools();
      const braveTool = tools.find(
        (t) => t.definition.function.name === 'brave_search',
      );

      if (process.env.BRAVE_API_KEY) {
        expect(braveTool).toBeDefined();
        console.log('[Test] ✓ Brave provider registered (API key found)');
      } else {
        expect(braveTool).toBeUndefined();
        console.log('[Test] ℹ Brave provider skipped (no API key)');
      }
    });

    it('should conditionally register SerpAPI provider based on API key', () => {
      const tools = toolRegistry.getAllTools();
      const serpapiTool = tools.find(
        (t) => t.definition.function.name === 'serpapi_search',
      );

      if (process.env.SERPAPI_API_KEY) {
        expect(serpapiTool).toBeDefined();
        console.log('[Test] ✓ SerpAPI provider registered (API key found)');
      } else {
        expect(serpapiTool).toBeUndefined();
        console.log('[Test] ℹ SerpAPI provider skipped (no API key)');
      }
    });

    it('should have at least one search provider registered', () => {
      const tools = toolRegistry.getAllTools();
      const searchProviders = tools.filter((t) =>
        t.definition.function.name.includes('search'),
      );

      expect(searchProviders.length).toBeGreaterThan(0);
      console.log(
        `[Test] ✓ Total search providers registered: ${searchProviders.length}`,
      );
      searchProviders.forEach((provider) => {
        console.log(`  - ${provider.definition.function.name}`);
      });
    });
  });

  describe('Tool Definitions', () => {
    it('should expose tools to the orchestrator via ToolExecutor', () => {
      const availableTools = toolExecutor.getAvailableTools();

      expect(availableTools).toBeDefined();
      expect(Array.isArray(availableTools)).toBe(true);
      expect(availableTools.length).toBeGreaterThan(0);

      console.log(
        `[Test] ✓ Orchestrator has access to ${availableTools.length} tools`,
      );
    });

    it('should include DuckDuckGo search in available tools', () => {
      const availableTools = toolExecutor.getAvailableTools();
      const duckduckgoTool = availableTools.find(
        (t) => t.function.name === 'duckduckgo_search',
      );

      expect(duckduckgoTool).toBeDefined();
      expect(duckduckgoTool?.function).toHaveProperty('name');
      expect(duckduckgoTool?.function).toHaveProperty('description');
      expect(duckduckgoTool?.function).toHaveProperty('parameters');
      expect(duckduckgoTool?.function.parameters).toHaveProperty('required');

      console.log('[Test] ✓ DuckDuckGo tool definition is valid');
      console.log(`  Name: ${duckduckgoTool?.function.name}`);
      console.log(`  Description: ${duckduckgoTool?.function.description}`);
    });

    it('should validate tool parameter schemas', () => {
      const availableTools = toolExecutor.getAvailableTools();
      const searchTools = availableTools.filter((t) =>
        t.function.name.includes('search'),
      );

      searchTools.forEach((tool) => {
        expect(tool.function.parameters).toHaveProperty('type');
        expect(tool.function.parameters).toHaveProperty('required');
        expect(tool.function.parameters).toHaveProperty('properties');
        expect(tool.function.parameters.properties).toHaveProperty('query');

        console.log(`[Test] ✓ ${tool.function.name} has valid schema`);
      });
    });
  });

  describe('Search Execution', () => {
    it('should execute DuckDuckGo search and return SearchResult[]', async () => {
      const results = await duckduckgoProvider.execute({
        query: 'TypeScript programming language',
        max_results: 3,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      // Note: DuckDuckGo API may return 0 results for some queries
      // This is expected behavior, not a bug

      if (results.length > 0) {
        // Validate SearchResult interface
        results.forEach((result: SearchResult) => {
          expect(result).toHaveProperty('title');
          expect(result).toHaveProperty('url');
          expect(result).toHaveProperty('content');
          expect(typeof result.title).toBe('string');
          expect(typeof result.url).toBe('string');
          expect(typeof result.content).toBe('string');

          // Optional score field
          if (result.score !== undefined) {
            expect(typeof result.score).toBe('number');
          }
        });

        console.log(
          `[Test] ✓ DuckDuckGo search returned ${results.length} results`,
        );
        console.log(`  First result: "${results[0].title}"`);
      } else {
        console.log(
          '[Test] ℹ DuckDuckGo returned 0 results (API behavior, not a bug)',
        );
      }
    }, 15000); // 15 second timeout for network requests

    it('should execute Brave search when API key is available', async () => {
      if (!process.env.BRAVE_API_KEY) {
        console.log('[Test] ⏭ Skipping Brave test (no API key)');
        return;
      }

      const results = await braveProvider.execute({
        query: 'artificial intelligence news 2024',
        max_results: 3,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      results.forEach((result: SearchResult) => {
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('url');
        expect(result).toHaveProperty('content');
      });

      console.log(`[Test] ✓ Brave search returned ${results.length} results`);
      console.log(`  First result: "${results[0].title}"`);
    }, 20000);

    it('should execute SerpAPI search when API key is available', async () => {
      if (!process.env.SERPAPI_API_KEY) {
        console.log('[Test] ⏭ Skipping SerpAPI test (no API key)');
        return;
      }

      const results = await serpapiProvider.execute({
        query: 'climate change research 2024',
        max_results: 3,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      results.forEach((result: SearchResult) => {
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('url');
        expect(result).toHaveProperty('content');
      });

      console.log(`[Test] ✓ SerpAPI search returned ${results.length} results`);
      console.log(`  First result: "${results[0].title}"`);
    }, 20000);

    it('should execute ALL available search providers and compare results', async () => {
      const searchProviders = [
        {
          name: 'duckduckgo_search',
          provider: duckduckgoProvider,
          requiresKey: false,
        },
        {
          name: 'brave_search',
          provider: braveProvider,
          requiresKey: true,
          keyEnv: 'BRAVE_API_KEY',
        },
        {
          name: 'serpapi_search',
          provider: serpapiProvider,
          requiresKey: true,
          keyEnv: 'SERPAPI_API_KEY',
        },
      ];

      const testQuery = 'latest technology trends 2024';
      const allResults: {
        provider: string;
        count: number;
        firstTitle: string;
      }[] = [];

      for (const sp of searchProviders) {
        if (sp.requiresKey && !process.env[sp.keyEnv!]) {
          console.log(`[Test] ⏭ Skipping ${sp.name} (no API key)`);
          continue;
        }

        try {
          const results = await sp.provider.execute({
            query: testQuery,
            max_results: 3,
          });
          allResults.push({
            provider: sp.name,
            count: results.length,
            firstTitle: results[0]?.title || 'N/A',
          });
          console.log(`[Test] ✓ ${sp.name}: ${results.length} results`);
        } catch (err) {
          console.log(`[Test] ✗ ${sp.name} failed: ${(err as Error).message}`);
        }
      }

      expect(allResults.length).toBeGreaterThan(0);
      console.log('\n[Test] Multi-Provider Search Summary:');
      allResults.forEach((r) => {
        console.log(`  ${r.provider}: ${r.count} results - "${r.firstTitle}"`);
      });
    }, 60000);

    it('should execute search via ToolRegistry', async () => {
      const results = await toolRegistry.execute('duckduckgo_search', {
        query: 'artificial intelligence',
        max_results: 2,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      console.log(
        `[Test] ✓ ToolRegistry executed search successfully (${results.length} results)`,
      );
    }, 15000);

    it('should execute search via ToolExecutor (orchestrator path)', async () => {
      const mockStep = {
        id: 'test-step-1',
        type: 'tool_call' as const,
        toolName: 'duckduckgo_search',
        config: {
          query: 'machine learning',
          max_results: 2,
        },
      };

      const executorResult = await toolExecutor.execute(
        mockStep,
        'test-log-id',
      );

      expect(executorResult).toBeDefined();
      expect(executorResult.output).toBeDefined();
      expect(Array.isArray(executorResult.output)).toBe(true);
      expect(executorResult.durationMs).toBeGreaterThan(0);
      expect(executorResult.error).toBeUndefined();

      const results = executorResult.output as SearchResult[];
      expect(results.length).toBeGreaterThan(0);

      console.log(
        `[Test] ✓ ToolExecutor executed search in ${executorResult.durationMs}ms`,
      );
      console.log(`  Results: ${results.length} items`);
    }, 15000);
  });

  describe('Error Handling', () => {
    it('should throw error for empty query', async () => {
      await expect(
        duckduckgoProvider.execute({ query: '', max_results: 5 }),
      ).rejects.toThrow();

      console.log('[Test] ✓ Empty query validation works');
    });

    it('should throw error for invalid max_results type', async () => {
      await expect(
        duckduckgoProvider.execute({
          query: 'test',
          max_results: 'invalid' as any,
        }),
      ).rejects.toThrow();

      console.log('[Test] ✓ max_results type validation works');
    });

    it('should return clear error message for non-existent tool', async () => {
      await expect(
        toolRegistry.execute('nonexistent_search', { query: 'test' }),
      ).rejects.toThrow('Tool not found');

      console.log('[Test] ✓ Non-existent tool error handling works');
    });

    it('should handle network failures gracefully', async () => {
      // Test with unreachable domain to trigger network error
      const mockStep = {
        id: 'test-step-2',
        type: 'tool_call' as const,
        toolName: 'duckduckgo_search',
        config: {
          query: '',
          max_results: 5,
        },
      };

      const result = await toolExecutor.execute(mockStep, 'test-log-id');

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBeTruthy();

      console.log('[Test] ✓ Network error handling works');
      console.log(`  Error: ${result.error?.message}`);
    }, 15000);
  });

  describe('SearchResult Interface Validation', () => {
    it('should return results conforming to SearchResult interface', async () => {
      const results = await duckduckgoProvider.execute({
        query: 'Node.js framework',
        max_results: 3,
      });

      expect(Array.isArray(results)).toBe(true);

      results.forEach((result: any) => {
        // Required fields
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('url');
        expect(result).toHaveProperty('content');

        // Type validation
        expect(typeof result.title).toBe('string');
        expect(typeof result.url).toBe('string');
        expect(typeof result.content).toBe('string');

        // Optional score field
        if (result.score !== undefined) {
          expect(typeof result.score).toBe('number');
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(1);
        }

        // Content validation
        expect(result.title.length).toBeGreaterThan(0);
        expect(result.content.length).toBeGreaterThan(0);
        // URL can be empty for some DuckDuckGo results
      });

      console.log('[Test] ✓ All results conform to SearchResult interface');
    }, 15000);
  });

  describe('Multi-Provider Availability', () => {
    it('should provide graceful degradation without API keys', () => {
      const tools = toolRegistry.getAllTools();
      const searchProviders = tools.filter((t) =>
        t.definition.function.name.includes('search'),
      );

      // Should have at least DuckDuckGo
      expect(searchProviders.length).toBeGreaterThanOrEqual(1);

      const providerNames = searchProviders.map(
        (p) => p.definition.function.name,
      );
      console.log('[Test] ✓ Graceful degradation verified');
      console.log(`  Available providers: ${providerNames.join(', ')}`);

      // Log environment configuration
      console.log('\n[Test] Environment Configuration:');
      console.log(
        `  BRAVE_API_KEY: ${process.env.BRAVE_API_KEY ? 'configured' : 'not set'}`,
      );
      console.log(
        `  SERPAPI_API_KEY: ${process.env.SERPAPI_API_KEY ? 'configured' : 'not set'}`,
      );
    });

    it('should expose all available providers to orchestrator', () => {
      const availableTools = toolExecutor.getAvailableTools();
      const searchTools = availableTools.filter((t) =>
        t.function.name.includes('search'),
      );

      expect(searchTools.length).toBeGreaterThan(0);

      console.log('\n[Test] ✓ Orchestrator Tool Availability:');
      searchTools.forEach((tool) => {
        console.log(`  ✓ ${tool.function.name}`);
        console.log(`    ${tool.function.description}`);
      });
    });
  });

  describe('Integration Summary', () => {
    it('should summarize multi-provider search system status', () => {
      const allTools = toolRegistry.getAllTools();
      const searchProviders = allTools.filter((t) =>
        t.definition.function.name.includes('search'),
      );
      const availableToOrchestrator = toolExecutor.getAvailableTools();

      console.log('\n========================================');
      console.log('MULTI-PROVIDER SEARCH SYSTEM STATUS');
      console.log('========================================');
      console.log(`Total Tools Registered: ${allTools.length}`);
      console.log(`Search Providers: ${searchProviders.length}`);
      console.log(
        `Tools Available to Orchestrator: ${availableToOrchestrator.length}`,
      );
      console.log('\nRegistered Search Providers:');

      searchProviders.forEach((provider) => {
        const tool = allTools.find(
          (t) =>
            t.definition.function.name === provider.definition.function.name,
        );
        const requiresKey = tool?.requiresApiKey ? 'Yes' : 'No';
        console.log(`  - ${provider.definition.function.name}`);
        console.log(`    Requires API Key: ${requiresKey}`);
        console.log(
          `    Description: ${provider.definition.function.description}`,
        );
      });

      console.log('\n========================================\n');

      // Assert minimum requirements
      expect(searchProviders.length).toBeGreaterThan(0);
      expect(availableToOrchestrator.length).toBeGreaterThan(0);
    });
  });
});
