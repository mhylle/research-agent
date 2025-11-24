import { Injectable, OnModuleInit, HttpException, HttpStatus, NotFoundException, BadRequestException } from '@nestjs/common';
import { PipelineExecutor } from './pipeline-executor.service';
import { ToolRegistry } from '../tools/registry/tool-registry.service';
import { TavilySearchProvider } from '../tools/providers/tavily-search.provider';
import { WebFetchProvider } from '../tools/providers/web-fetch.provider';
import { ChatMessage } from '../llm/interfaces/chat-message.interface';
import { ResearchResult } from './interfaces/research-result.interface';
import { ResearchLogger } from '../logging/research-logger.service';
import { LogsService } from '../logs/logs.service';
import { randomUUID } from 'crypto';

@Injectable()
export class ResearchService implements OnModuleInit {
  private readonly MAX_RETRIES = 3;
  // Track retry counts per node across service lifetime
  private retryCountMap = new Map<string, number>();

  constructor(
    private pipelineExecutor: PipelineExecutor,
    private toolRegistry: ToolRegistry,
    private tavilySearchProvider: TavilySearchProvider,
    private webFetchProvider: WebFetchProvider,
    private logger: ResearchLogger,
    private logsService: LogsService,
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

  async retryNode(logId: string, nodeId: string): Promise<void> {
    // 1. Validate that the log session exists
    let sessionDetails;
    try {
      sessionDetails = await this.logsService.getSessionDetails(logId);
    } catch (error) {
      throw new NotFoundException(`Log session not found: ${logId}`);
    }

    // 2. Get graph data to find the node
    const graphData = await this.logsService.getGraphData(logId);
    const node = graphData.nodes.find(n => n.id === nodeId);

    if (!node) {
      throw new NotFoundException(`Node not found: ${nodeId} in session ${logId}`);
    }

    // 3. Validate that the node is in error state
    if (node.status !== 'error') {
      throw new BadRequestException(
        `Node ${nodeId} is not in error state (current status: ${node.status}). Only failed nodes can be retried.`
      );
    }

    // 4. Check retry count
    const retryKey = `${logId}:${nodeId}`;
    const currentRetryCount = this.retryCountMap.get(retryKey) || 0;

    if (currentRetryCount >= this.MAX_RETRIES) {
      throw new BadRequestException(
        `Maximum retry attempts (${this.MAX_RETRIES}) exceeded for node ${nodeId}`
      );
    }

    // 5. Increment retry count
    this.retryCountMap.set(retryKey, currentRetryCount + 1);

    // 6. Log retry attempt
    this.logger.nodeStart(
      `${nodeId}-retry-${currentRetryCount + 1}`,
      logId,
      'retry',
      nodeId
    );

    try {
      // 7. Re-execute the node based on its type
      if (node.type === 'stage') {
        await this.retryStage(logId, node, sessionDetails, currentRetryCount + 1);
      } else if (node.type === 'tool') {
        await this.retryTool(logId, node, currentRetryCount + 1);
      } else {
        throw new BadRequestException(
          `Retry not supported for node type: ${node.type}`
        );
      }

      // 8. Log successful retry
      this.logger.nodeComplete(
        `${nodeId}-retry-${currentRetryCount + 1}`,
        logId,
        { retryCount: currentRetryCount + 1 }
      );
    } catch (error) {
      // 9. Log retry failure
      this.logger.nodeError(
        `${nodeId}-retry-${currentRetryCount + 1}`,
        logId,
        error
      );
      throw new HttpException(
        `Retry failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async retryStage(
    logId: string,
    node: any,
    sessionDetails: any,
    retryCount: number
  ): Promise<void> {
    // Extract stage number from node ID (e.g., "pipeline-1" -> 1)
    const stageMatch = node.id.match(/stage-(\d+)/);
    if (!stageMatch) {
      throw new BadRequestException(`Invalid stage node ID: ${node.id}`);
    }

    const stageNumber = parseInt(stageMatch[1], 10);

    // Rebuild the context for this stage from the session details
    // This is a simplified retry - in production, you'd need to reconstruct
    // the full message history and context from the log entries
    const messages: ChatMessage[] = [
      { role: 'user', content: sessionDetails.query }
    ];

    // Determine which tools and system prompt to use based on stage
    let tools: any[] = [];
    let systemPrompt = '';

    switch (stageNumber) {
      case 1:
        tools = [this.tavilySearchProvider.definition];
        systemPrompt = `You are a research assistant. Analyze the user's query and use the tavily_search tool to find relevant information. Generate 2-3 targeted search queries to thoroughly research the topic.`;
        break;
      case 2:
        tools = [this.webFetchProvider.definition];
        systemPrompt = `IMPORTANT: You MUST use the web_fetch tool to retrieve full content from sources.

Your task:
1. Analyze the search results from Stage 1
2. Identify the 3-5 most relevant and authoritative URLs
3. For EACH selected URL, you MUST call the web_fetch tool with that URL
4. DO NOT provide analysis yet - only make tool calls to fetch content

Example: If you select URLs A, B, C - you must make 3 web_fetch tool calls.

You must respond ONLY with tool calls. Do not write analysis or summaries at this stage.`;
        break;
      case 3:
        tools = [];
        systemPrompt = `Synthesize a comprehensive answer from the retrieved content. Include source citations and organize information clearly.`;
        break;
      default:
        throw new BadRequestException(`Invalid stage number: ${stageNumber}`);
    }

    // Execute the stage with retry
    await this.pipelineExecutor.executeStage({
      stageNumber,
      messages,
      tools,
      systemPrompt,
      logId,
    });
  }

  private async retryTool(
    logId: string,
    node: any,
    retryCount: number
  ): Promise<void> {
    // Extract tool name from node
    if (!node.input) {
      throw new BadRequestException(`No input data found for tool node: ${node.id}`);
    }

    // Reconstruct tool call from node data
    const toolCall = {
      function: {
        name: node.name,
        arguments: node.input
      }
    };

    // Execute the tool with retry
    await this.pipelineExecutor.executeToolCalls(
      [toolCall],
      logId,
      node.parentId
    );
  }
}
