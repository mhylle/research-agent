import { Injectable, Logger } from '@nestjs/common';
import { OllamaService } from '../../llm/ollama.service';
import { EmbeddingService } from '../../knowledge/embedding.service';
import { Claim } from '../interfaces/claim.interface';
import { EntailmentResult, SourceEvidence } from '../interfaces/entailment.interface';

interface Source {
  id: string;
  url: string;
  content: string;
  title?: string;
  relevance?: number;
}

@Injectable()
export class EntailmentCheckerService {
  private readonly logger = new Logger(EntailmentCheckerService.name);
  private readonly SIMILARITY_THRESHOLD = 0.7; // Minimum similarity for relevant passages
  private readonly MAX_PASSAGES_PER_SOURCE = 3; // Max passages to extract per source

  constructor(
    private readonly ollamaService: OllamaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Check if a claim is entailed by the provided sources
   */
  async checkEntailment(
    claim: Claim,
    sources: Source[],
  ): Promise<EntailmentResult> {
    this.logger.debug(`Checking entailment for claim: ${claim.text.substring(0, 100)}...`);

    // Find relevant passages in sources using semantic similarity
    const relevantPassages = await this.findRelevantPassages(claim.text, sources);

    if (relevantPassages.length === 0) {
      this.logger.warn('No relevant passages found for claim');
      return this.createNeutralResult(claim, 'No relevant source passages found');
    }

    // Use LLM to assess entailment
    const entailmentAssessment = await this.assessEntailment(claim.text, relevantPassages);

    return entailmentAssessment;
  }

  private async findRelevantPassages(
    claimText: string,
    sources: Source[],
  ): Promise<SourceEvidence[]> {
    const claimEmbedding = await this.embeddingService.generateEmbedding(claimText);
    const relevantPassages: SourceEvidence[] = [];

    for (const source of sources) {
      // Split source content into paragraphs/chunks
      const chunks = this.splitIntoChunks(source.content);

      for (const chunk of chunks) {
        if (chunk.length < 50) continue; // Skip very short chunks

        try {
          const chunkEmbedding = await this.embeddingService.generateEmbedding(chunk);
          const similarity = this.cosineSimilarity(claimEmbedding, chunkEmbedding);

          if (similarity >= this.SIMILARITY_THRESHOLD) {
            relevantPassages.push({
              sourceId: source.id,
              sourceUrl: source.url,
              relevantText: chunk,
              similarity,
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to process chunk from source ${source.id}: ${error.message}`);
        }
      }
    }

    // Sort by similarity and limit results
    relevantPassages.sort((a, b) => b.similarity - a.similarity);
    return relevantPassages.slice(0, this.MAX_PASSAGES_PER_SOURCE * sources.length);
  }

  private splitIntoChunks(content: string): string[] {
    // Split by paragraphs (double newline) or sentences
    const paragraphs = content.split(/\n\n+/);
    const chunks: string[] = [];

    for (const para of paragraphs) {
      if (para.length > 1000) {
        // Split large paragraphs into sentences
        const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
        let currentChunk = '';

        for (const sentence of sentences) {
          if ((currentChunk + sentence).length > 1000 && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
          } else {
            currentChunk += sentence;
          }
        }

        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
        }
      } else {
        chunks.push(para.trim());
      }
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private async assessEntailment(
    claimText: string,
    passages: SourceEvidence[],
  ): Promise<EntailmentResult> {
    const prompt = this.buildEntailmentPrompt(claimText, passages);

    try {
      const response = await this.ollamaService.chat([
        {
          role: 'system',
          content: 'You are an entailment assessment expert. Determine if a claim is entailed, neutral, or contradicted by source passages. Always respond with valid JSON only, no additional text.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ]);

      return this.parseEntailmentResponse(response.message.content, passages);
    } catch (error) {
      this.logger.error(`Failed to assess entailment: ${error.message}`);
      return this.createNeutralResult({ text: claimText } as Claim, 'Entailment assessment failed');
    }
  }

  private buildEntailmentPrompt(claimText: string, passages: SourceEvidence[]): string {
    const passageTexts = passages
      .map((p, idx) => `[Passage ${idx + 1} from ${p.sourceUrl}]\n${p.relevantText}`)
      .join('\n\n');

    return `Assess whether the following claim is entailed, neutral, or contradicted by the source passages.

Claim:
"""
${claimText}
"""

Source Passages:
"""
${passageTexts}
"""

Determine:
1. verdict: "entailed" (supported by sources), "neutral" (not mentioned), or "contradicted" (conflicts with sources)
2. score: 0.0 to 1.0 (confidence in the verdict)
3. supportingPassages: array of passage indices that support the claim
4. contradictingPassages: array of passage indices that contradict the claim
5. reasoning: brief explanation

Respond with ONLY JSON in this exact format:
{
  "verdict": "entailed",
  "score": 0.95,
  "supportingPassages": [0, 1],
  "contradictingPassages": [],
  "reasoning": "explanation here"
}`;
  }

  private parseEntailmentResponse(
    responseContent: string,
    passages: SourceEvidence[],
  ): EntailmentResult {
    try {
      // Try to extract JSON from response
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      const result = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!result.verdict || typeof result.score !== 'number') {
        throw new Error('Missing required fields in response');
      }

      // Map passage indices to actual passages
      const supportingSources = (result.supportingPassages || [])
        .map((idx: number) => passages[idx])
        .filter((p: SourceEvidence | undefined) => p !== undefined);

      const contradictingSources = (result.contradictingPassages || [])
        .map((idx: number) => passages[idx])
        .filter((p: SourceEvidence | undefined) => p !== undefined);

      return {
        claim: { text: '' } as Claim, // Will be set by caller
        verdict: result.verdict,
        score: Math.max(0, Math.min(1, result.score)), // Clamp to [0, 1]
        supportingSources,
        contradictingSources,
        reasoning: result.reasoning || 'No reasoning provided',
      };
    } catch (error) {
      this.logger.error(`Failed to parse entailment response: ${error.message}`);
      this.logger.debug(`Response content: ${responseContent}`);
      throw error;
    }
  }

  private createNeutralResult(claim: Claim, reasoning: string): EntailmentResult {
    return {
      claim,
      verdict: 'neutral',
      score: 0.5,
      supportingSources: [],
      contradictingSources: [],
      reasoning,
    };
  }
}
