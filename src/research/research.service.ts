import { Injectable, OnModuleInit } from '@nestjs/common';
import { PipelineExecutor } from './pipeline-executor.service';
import { ToolRegistry } from '../tools/registry/tool-registry.service';
import { TavilySearchProvider } from '../tools/providers/tavily-search.provider';
import { WebFetchProvider } from '../tools/providers/web-fetch.provider';
import { ChatMessage } from '../llm/interfaces/chat-message.interface';
import { ResearchResult } from './interfaces/research-result.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class ResearchService implements OnModuleInit {
  constructor(
    private pipelineExecutor: PipelineExecutor,
    private toolRegistry: ToolRegistry,
    private tavilySearchProvider: TavilySearchProvider,
    private webFetchProvider: WebFetchProvider,
  ) {}

  onModuleInit() {
    // Register tools on startup
    this.toolRegistry.register(this.tavilySearchProvider);
    this.toolRegistry.register(this.webFetchProvider);
  }

  async executeResearch(query: string, options?: any): Promise<ResearchResult> {
    const logId = randomUUID();
    const startTime = Date.now();
    const stageMetrics: Array<{ stage: number; executionTime: number }> = [];

    const messages: ChatMessage[] = [
      { role: 'user', content: query }
    ];

    // Stage 1: Query Analysis & Search
    const stage1 = await this.pipelineExecutor.executeStage({
      stageNumber: 1,
      messages,
      tools: [this.tavilySearchProvider.definition],
      systemPrompt: `You are a research assistant. Analyze the user's query and use the tavily_search tool to find relevant information. Generate 2-3 targeted search queries to thoroughly research the topic.`,
      logId,
    });
    stageMetrics.push({ stage: 1, executionTime: stage1.executionTime });

    const searchResults = await this.pipelineExecutor.executeToolCalls(
      stage1.tool_calls,
      logId,
      `stage-1`
    );

    messages.push(stage1.message);
    messages.push({
      role: 'tool',
      content: JSON.stringify(searchResults)
    });

    // Stage 2: Source Selection & Fetch
    const stage2 = await this.pipelineExecutor.executeStage({
      stageNumber: 2,
      messages,
      tools: [this.webFetchProvider.definition],
      systemPrompt: `IMPORTANT: You MUST use the web_fetch tool to retrieve full content from sources.

Your task:
1. Analyze the search results from Stage 1
2. Identify the 3-5 most relevant and authoritative URLs
3. For EACH selected URL, you MUST call the web_fetch tool with that URL
4. DO NOT provide analysis yet - only make tool calls to fetch content

Example: If you select URLs A, B, C - you must make 3 web_fetch tool calls.

You must respond ONLY with tool calls. Do not write analysis or summaries at this stage.`,
      logId,
    });
    stageMetrics.push({ stage: 2, executionTime: stage2.executionTime });

    const fetchedContent = await this.pipelineExecutor.executeToolCalls(
      stage2.tool_calls,
      logId,
      `stage-2`
    );

    messages.push(stage2.message);
    messages.push({
      role: 'tool',
      content: JSON.stringify(fetchedContent)
    });

    // Stage 3: Synthesis
    const stage3 = await this.pipelineExecutor.executeStage({
      stageNumber: 3,
      messages,
      tools: [],
      systemPrompt: `Synthesize a comprehensive answer from the retrieved content. Include source citations and organize information clearly.`,
      logId,
    });
    stageMetrics.push({ stage: 3, executionTime: stage3.executionTime });

    const totalExecutionTime = Date.now() - startTime;

    // Extract sources from search results
    const sources = searchResults.flat().map((result: any) => ({
      url: result.url,
      title: result.title,
      relevance: result.score > 0.7 ? 'high' : 'medium',
    }));

    return {
      logId,
      answer: stage3.message.content,
      sources,
      metadata: {
        totalExecutionTime,
        stages: stageMetrics,
      },
    };
  }
}
