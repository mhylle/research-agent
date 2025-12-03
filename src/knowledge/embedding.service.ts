import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly ollamaBaseUrl: string;
  private readonly embeddingModel: string;
  private readonly dimensions: number;

  // nomic-embed-text context: ~8K tokens ≈ 6000 words ≈ 30,000 chars
  // Leave buffer for safety
  private readonly MAX_CHARS = 28000;

  constructor(private readonly configService: ConfigService) {
    this.ollamaBaseUrl =
      this.configService.get<string>('OLLAMA_BASE_URL') ||
      'http://localhost:11434';
    this.embeddingModel =
      this.configService.get<string>('EMBEDDING_MODEL') || 'nomic-embed-text';
    this.dimensions =
      this.configService.get<number>('EMBEDDING_DIMENSIONS') || 768;
  }

  /**
   * Generate embedding for raw text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    this.logger.debug(
      `Generating embedding for text (${text.length} chars) using ${this.embeddingModel}`,
    );

    try {
      const response = await axios.post(
        `${this.ollamaBaseUrl}/api/embed`,
        {
          model: this.embeddingModel,
          input: text,
        },
        {
          timeout: 30000,
        },
      );

      const embeddings = response.data.embeddings;
      if (!embeddings || !embeddings[0]) {
        throw new Error('No embedding returned from Ollama');
      }

      const embedding = embeddings[0];
      this.logger.debug(
        `Generated embedding with ${embedding.length} dimensions`,
      );

      return embedding;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to generate embedding: ${errorMessage}`);
      throw new Error(`Embedding generation failed: ${errorMessage}`);
    }
  }

  /**
   * Generate embedding for a research result (query + answer combined)
   * If content is too long, summarizes the answer first
   */
  async generateEmbeddingForResearch(
    query: string,
    answer: string,
  ): Promise<number[]> {
    const combined = this.combineQueryAndAnswer(query, answer);

    if (combined.length <= this.MAX_CHARS) {
      return this.generateEmbedding(combined);
    }

    // Content too long - summarize the answer
    this.logger.debug(
      `Content too long (${combined.length} chars), summarizing...`,
    );

    const summarizedAnswer = await this.summarizeForEmbedding(answer);
    const reducedText = this.combineQueryAndAnswer(
      query,
      summarizedAnswer,
      true,
    );

    return this.generateEmbedding(reducedText);
  }

  /**
   * Combine query and answer into a single text for embedding
   */
  private combineQueryAndAnswer(
    query: string,
    answer: string,
    isSummarized: boolean = false,
  ): string {
    const answerLabel = isSummarized ? 'Answer (summarized)' : 'Answer';
    return `Query: ${query}\n\n${answerLabel}: ${answer}`;
  }

  /**
   * Summarize text using LLM to fit within embedding context
   * Preserves key facts, entities, and conclusions
   */
  private async summarizeForEmbedding(text: string): Promise<string> {
    this.logger.debug(`Summarizing text (${text.length} chars) for embedding`);

    const chatModel =
      this.configService.get<string>('OLLAMA_MODEL') || 'qwen3:14b';

    try {
      const response = await axios.post(
        `${this.ollamaBaseUrl}/api/chat`,
        {
          model: chatModel,
          messages: [
            {
              role: 'system',
              content:
                'You are a summarization assistant. Create a concise summary that preserves all key facts, entities, dates, numbers, and conclusions. The summary should capture the semantic meaning for search purposes.',
            },
            {
              role: 'user',
              content: `Summarize the following research answer in approximately 5000 words or less, preserving all key information:\n\n${text}`,
            },
          ],
          stream: false,
        },
        {
          timeout: 60000,
        },
      );

      const summary = response.data.message?.content || '';
      this.logger.debug(
        `Summarized from ${text.length} to ${summary.length} chars`,
      );

      return summary;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to summarize: ${errorMessage}`);

      // Fallback: truncate if summarization fails
      this.logger.warn('Falling back to truncation');
      return text.substring(0, 20000) + '... [truncated]';
    }
  }

  /**
   * Get the configured embedding dimensions
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * Get the configured embedding model
   */
  getModel(): string {
    return this.embeddingModel;
  }
}
