# Internal Knowledge Base Search - Implementation Plan

## Overview
Add an internal knowledge base search provider that searches prior research results using PostgreSQL full-text search. Returns synthesized answers from previous research as search results.

## Architecture

### New Components

```
src/tools/providers/
├── knowledge-search.provider.ts       # New search provider
├── interfaces/
│   └── knowledge-search-args.interface.ts  # Args interface

src/knowledge/
├── knowledge.module.ts                # Module for knowledge services
├── knowledge-search.service.ts        # Full-text search service
```

### Database Changes
- Add PostgreSQL full-text search index on `research_results` table
- Create migration to add `search_vector` column (tsvector)

## Implementation Steps

### Phase 1: Database Setup

1. **Create migration for full-text search**
   - Add `search_vector` column (tsvector) to `research_results`
   - Create GIN index for fast searching
   - Add trigger to auto-update search_vector on insert/update

```sql
-- Migration
ALTER TABLE research_results
ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(query, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(answer, '')), 'B')
) STORED;

CREATE INDEX idx_research_results_search ON research_results USING GIN(search_vector);
```

### Phase 2: Knowledge Search Service

2. **Create `KnowledgeSearchService`** (`src/knowledge/knowledge-search.service.ts`)
   - Method: `searchPriorResearch(query: string, maxResults: number): Promise<SearchResult[]>`
   - Uses PostgreSQL `ts_query` and `ts_rank` for relevance scoring
   - Converts ResearchResultEntity to SearchResult format:
     - `title`: Original query from prior research
     - `url`: Internal reference (e.g., `knowledge://research/{id}`)
     - `content`: Synthesized answer (truncated if needed)
     - `score`: ts_rank relevance score

3. **Create `KnowledgeModule`** (`src/knowledge/knowledge.module.ts`)
   - Imports TypeOrmModule with ResearchResultEntity
   - Provides KnowledgeSearchService
   - Exports KnowledgeSearchService

### Phase 3: Knowledge Search Provider

4. **Create args interface** (`src/tools/providers/interfaces/knowledge-search-args.interface.ts`)
   ```typescript
   export interface KnowledgeSearchArgs {
     query: string;
     max_results?: number;
   }
   ```

5. **Create `KnowledgeSearchProvider`** (`src/tools/providers/knowledge-search.provider.ts`)
   - Implements `ITool` interface
   - Tool name: `knowledge_search`
   - Description: "Search internal knowledge base of prior research results"
   - `requiresApiKey = false` (no external API needed)
   - Injects KnowledgeSearchService
   - Returns SearchResult[] matching the standard interface

### Phase 4: Registration

6. **Update `ToolsModule`** (`src/tools/tools.module.ts`)
   - Import KnowledgeModule
   - Add KnowledgeSearchProvider to providers
   - Register with ToolRegistry

7. **Update `ExecutorsModule`** (`src/executors/executors.module.ts`)
   - Register `knowledge_search` executor

### Phase 5: Testing

8. **Create unit tests**
   - `knowledge-search.service.spec.ts` - Test full-text search logic
   - `knowledge-search.provider.spec.ts` - Test provider interface

9. **Create E2E test**
   - Test that knowledge_search is registered
   - Test that it returns prior research results
   - Test relevance scoring

## File Changes Summary

### New Files
| File | Description |
|------|-------------|
| `src/knowledge/knowledge.module.ts` | Module for knowledge services |
| `src/knowledge/knowledge-search.service.ts` | Full-text search service |
| `src/tools/providers/knowledge-search.provider.ts` | Search provider |
| `src/tools/providers/interfaces/knowledge-search-args.interface.ts` | Args interface |
| `src/migrations/XXXX-add-fulltext-search.ts` | Database migration |

### Modified Files
| File | Change |
|------|--------|
| `src/tools/tools.module.ts` | Add KnowledgeSearchProvider |
| `src/executors/executors.module.ts` | Register knowledge_search |

## SearchResult Format

When the knowledge base search finds a relevant prior research:

```typescript
{
  title: "What are the latest developments in quantum physics?",  // Original query
  url: "knowledge://research/abc123-uuid",                        // Internal reference
  content: "Based on recent research... [synthesized answer]",    // Prior answer
  score: 0.85                                                     // Relevance score (0-1)
}
```

## LLM Planner Integration

The LLM planner will see `knowledge_search` as an available tool with description:
> "Search internal knowledge base for prior research results. Best for finding previously researched topics. Returns synthesized answers from past research queries."

The planner can choose to use this tool alongside external search tools like `tavily_search`, `brave_search`, etc.

## Future Enhancements (Not in this implementation)
- Vector embeddings for semantic search
- Configurable relevance threshold
- Time-based weighting (prefer recent research)
- Source aggregation from multiple prior researches
- Additional knowledge sources (documents, files)
