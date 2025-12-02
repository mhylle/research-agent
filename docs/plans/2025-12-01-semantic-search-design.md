# Semantic Search for Knowledge Base - Design Document

## Overview
Add semantic search capability to the internal knowledge base using vector embeddings (pgvector + Ollama). Combines with existing full-text search for hybrid scoring.

## Decisions Made
- **Embedding Model**: `nomic-embed-text` via Ollama (768 dimensions, 8K context)
- **Vector Storage**: pgvector extension for PostgreSQL
- **Search Strategy**: Hybrid - combined scoring (0.7 semantic + 0.3 full-text)
- **Content to Embed**: Query + Answer combined
- **Embedding Timing**: Batch migration for existing, synchronous for new
- **Long Content**: Summarize via LLM if exceeds context limit

## Database Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE research_results
ADD COLUMN embedding vector(768);

CREATE INDEX idx_research_results_embedding
ON research_results USING hnsw (embedding vector_cosine_ops);
```

## Architecture

### New Components
- `EmbeddingService` - Generate embeddings via Ollama API
  - `generateEmbedding(text)` - Raw embedding generation
  - `generateEmbeddingForResearch(query, answer)` - Combined with summarization

### Modified Components
- `KnowledgeSearchService` - Add hybrid search
  - `searchHybrid()` - Combined semantic + full-text
  - `searchSemantic()` - Vector similarity search
  - `mergeResults()` - Weighted score combination

- `ResearchResultService` - Generate embedding on save

## Hybrid Search Flow

```
1. User query arrives
2. Generate query embedding (nomic-embed-text)
3. Run in parallel:
   - Semantic: pgvector cosine similarity
   - Full-text: PostgreSQL ts_rank
4. Merge results:
   - finalScore = (semantic × 0.7) + (fulltext × 0.3)
   - Deduplicate by ID
   - Boost results appearing in both
5. Return top N results
```

## Embedding Generation Flow

```
1. Combine: "Query: {query}\n\nAnswer: {answer}"
2. If length > 28K chars:
   - Summarize answer via LLM preserving key facts
   - Recombine with query
3. Call Ollama embed API
4. Return 768-dim vector
```

## Files to Create
| File | Purpose |
|------|---------|
| `src/knowledge/embedding.service.ts` | Ollama embedding generation |
| `src/migrations/XXXX-AddSemanticSearch.ts` | pgvector + column + index |

## Files to Modify
| File | Change |
|------|--------|
| `src/knowledge/knowledge-search.service.ts` | Add hybrid search methods |
| `src/knowledge/knowledge.module.ts` | Add EmbeddingService |
| `src/research/research-result.service.ts` | Generate embedding on save |
| `src/research/entities/research-result.entity.ts` | Add embedding column |
| `.env` | Add embedding config |

## Configuration
```env
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
SEMANTIC_WEIGHT=0.7
FULLTEXT_WEIGHT=0.3
```

## Implementation Order
1. Migration (pgvector + column + index)
2. EmbeddingService
3. Update KnowledgeSearchService with hybrid search
4. Update ResearchResultService to embed on save
5. Backfill script for existing results
6. E2E tests
