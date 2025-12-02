# Research Agent - Roadmap

**Last Updated**: 2025-12-02
**Document Purpose**: Track remaining unimplemented features and future work

---

## Completed Phases

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Enhanced Data Model & Backend | Completed |
| Phase 2 | Timeline Graph Visualization (D3.js Gantt chart) | Completed |
| Phase 3 | Real-time SSE & Token Cost Dashboard | Completed |
| Phase 4 | Animated Knowledge Graph with Digital Hygge styling | Completed |
| Phase 5 | Semantic Search & Internal Knowledge | Completed |

### Phase 5 Details: Semantic Search (Implemented)

**Components**:
- `EmbeddingService` - 768-dimensional vector embeddings via Ollama (nomic-embed-text)
- `KnowledgeSearchService` - Hybrid search (semantic 70% + full-text 30%)
- `KnowledgeSearchProvider` - LLM tool integration (`knowledge_search`)
- PostgreSQL pgvector extension with HNSW indexing
- Automatic embedding generation on research result save
- Backfill capability for existing results

**API Endpoints**:
- `GET /api/research/results` - List research results
- `GET /api/research/results/embeddings/stats` - Embedding statistics
- `POST /api/research/results/embeddings/backfill` - Generate missing embeddings

**Usage**: Integrated into planner - automatically considers prior research before external searches.

---

## Agentic System Enhancements (Priority)

> **Full specification**: See `docs/AGENTIC_ENHANCEMENTS.md` for detailed research findings, architecture diagrams, and implementation specifications.

These enhancements transform the Research Agent from a pipeline-based system into a truly agentic system with self-correction, uncertainty awareness, and meta-learning capabilities.

### Phase 6: Reflection & Self-Correction
**Status**: Not Started
**Priority**: P0 (Highest)
**Expected Impact**: 18-22% accuracy improvement

| Feature | Description | Effort |
|---------|-------------|--------|
| 6.1 ReAct Reasoning Traces | Explicit Thought→Action→Observation pattern with visible reasoning | Medium |
| 6.2 Reflexion Loop | Self-critique after answer generation, identify weaknesses | High |
| 6.3 Iterative Refinement | Multi-pass synthesis with feedback incorporation | High |

**Key Components**:
- `ReflectionService` - Orchestrates self-critique loop
- `GapDetector` - Identifies missing or weak claims
- `RefinementEngine` - Incorporates reflection feedback
- SSE events: `thought`, `action`, `observation`, `conclusion`

**Research Basis**: [Reflexion Framework](https://www.promptingguide.ai/techniques/reflexion) shows 22% improvement on decision-making tasks.

---

### Phase 7: Uncertainty Quantification & Confidence Scoring
**Status**: Not Started
**Priority**: P0 (Highest)
**Expected Impact**: Dramatically reduce misplaced trust in uncertain outputs

| Feature | Description | Effort |
|---------|-------------|--------|
| 7.1 Claim Extraction | Parse answers into discrete verifiable claims | Medium |
| 7.2 Source Entailment | Verify each claim against retrieved sources | High |
| 7.3 Semantic Consistency | Multi-sample agreement scoring | Medium |
| 7.4 SUScore Calculator | Substantive-word weighted uncertainty | Medium |
| 7.5 Confidence UI | Visual indicators and claim-level tooltips | Medium |

**Key Components**:
- `ClaimExtractor` - Parse answer into claims
- `EntailmentChecker` - Verify claims against sources
- `ConfidenceAggregator` - Ensemble scoring
- `ConfidenceAnnotator` - UI annotations

**Research Basis**: LLMs hallucinate in 69-88% of cases when uncertain. [UQLM Package](https://github.com/cvs-health/uqlm) provides state-of-the-art techniques.

---

### Phase 8: Multi-Agent Collaboration
**Status**: Not Started
**Priority**: P1 (High)
**Expected Impact**: Up to 70% higher success rates on complex tasks

| Feature | Description | Effort |
|---------|-------------|--------|
| 8.1 Specialist Agents | Separate Search, Synthesis, Fact-Check, Citation agents | Very High |
| 8.2 Fact-Checker Agent | Adversarial verification of synthesized answers | High |
| 8.3 Coordinator Agent | Task routing and conflict resolution | High |
| 8.4 Consensus Voting | Multiple synthesis passes with voting | Medium |
| 8.5 Adversarial Debate | Advocate vs. Critic pattern | High |

**Key Components**:
- `SearchAgent`, `SynthesisAgent`, `FactCheckAgent`, `CitationAgent`
- `CoordinatorAgent` - Orchestrates specialist agents
- `AgentCommunicationBus` - Inter-agent messaging

**Research Basis**: [Multi-Agent Collaboration Survey](https://arxiv.org/html/2501.06322v1) shows significant improvements on complex tasks.

---

### Phase 9: Enhanced Memory Systems
**Status**: Not Started
**Priority**: P1 (High)
**Expected Impact**: Coherent long-term behavior, personalization, meta-learning

| Feature | Description | Effort |
|---------|-------------|--------|
| 9.1 Working Memory | Current task context and scratch space | Medium |
| 9.2 Strategy Memory | Track what strategies work for query types | High |
| 9.3 Enhanced Episodic | User preferences, feedback history, outcomes | Medium |
| 9.4 Knowledge Graph Linking | A-Mem style interconnected knowledge | High |
| 9.5 Meta-Learning Loop | System improves strategy selection over time | High |

**Key Components**:
- `WorkingMemoryService` - Current task context
- `StrategyMemoryService` - Provider/approach performance tracking
- Enhanced `KnowledgeSearchService` with graph linking

**Research Basis**: [A-Mem Agentic Memory](https://arxiv.org/html/2502.12110v11) and [IBM AI Agent Memory](https://www.ibm.com/think/topics/ai-agent-memory).

---

### Phase 10: Agentic RAG Enhancements
**Status**: Not Started
**Priority**: P1 (High)
**Expected Impact**: More complete, accurate answers

| Feature | Description | Effort |
|---------|-------------|--------|
| 10.1 Query Decomposition | Break complex queries into atomic questions | Medium |
| 10.2 Iterative Retrieval | Retrieve → Analyze gaps → Retrieve more | High |
| 10.3 Intelligent Source Routing | Route to best provider based on past performance | Medium |
| 10.4 Semantic Caching | Reuse results from similar past queries | Medium |
| 10.5 Coverage Detection | Stop when coverage threshold met | Medium |

**Key Components**:
- `QueryDecomposer` - Break queries into sub-queries
- `CoverageAnalyzer` - Detect answered vs. unanswered aspects
- `SourceRouter` - Intelligent provider selection
- `SemanticCache` - Similar query result reuse

**Research Basis**: [IBM Agentic RAG](https://www.ibm.com/think/topics/agentic-rag).

---

### Phase 11: Planning Enhancements
**Status**: Not Started
**Priority**: P2 (Medium-High)
**Expected Impact**: Better task decomposition and execution

| Feature | Description | Effort |
|---------|-------------|--------|
| 11.1 Dynamic Planning | Adapt plan based on intermediate results | Medium |
| 11.2 Hierarchical Task Decomposition | Goal → Phases → Tasks structure | Medium |
| 11.3 Plan Adaptation Triggers | Respond to quality signals, time pressure | Medium |

**Research Basis**: [AWS Agentic AI Patterns](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/introduction.html).

---

## Agentic Enhancement Implementation Schedule

| Sprint | Phases | Focus |
|--------|--------|-------|
| Sprint 1-2 | 6.1, 7.1-7.4, 9.1 | Foundation (ReAct, Confidence, Working Memory) |
| Sprint 3-4 | 6.2, 6.3, 10.1-10.2 | Core Agentic (Reflexion, Iterative Retrieval) |
| Sprint 5-6 | 8.2, 8.1, 7.5 | Multi-Agent (Fact-Checker, Specialists, UI) |
| Sprint 7-8 | 9.2-9.5, 10.3-10.5 | Memory & Learning |
| Sprint 9-10 | 8.4-8.5, 11.1-11.3 | Advanced (Debate, Dynamic Planning) |

---

## Phase 12: Advanced Features (Planned)

> **Note**: These features are lower priority than the Agentic Enhancements above.

### 12.1 Comparative Analysis
**Status**: Not Started
**Priority**: P3 (Low)

Compare multiple research queries side-by-side:
- Overlay timeline graphs for comparison
- Diff analysis of evaluation scores
- Performance benchmarking across queries
- A/B testing support for different strategies

### 12.2 Historical Trends Dashboard
**Status**: Not Started
**Priority**: P3 (Low)

Track improvement over time:
- Score trends over sessions
- Performance metrics history
- Query pattern analysis
- System health dashboard

### 12.3 Export & Reporting
**Status**: Not Started
**Priority**: P3 (Low)

Export capabilities:
- Export timeline graphs as PNG/SVG
- Generate evaluation reports (PDF)
- CSV export for analytics
- Markdown export for documentation

### 12.4 Custom Evaluation Criteria
**Status**: Not Started
**Priority**: P4 (Lowest)

User-defined evaluation:
- Custom scoring dimensions
- Weighted scoring profiles
- Domain-specific evaluators
- Ground truth comparison (BLEU/ROUGE metrics)

---

## Phase 13: Real-time Live Monitoring (Deferred)

### 13.1 Live SSE Graph Updates
**Status**: Deferred
**Priority**: P4 (Lowest)

Real-time force-directed graph with live updates:
- SSE-integrated live node updates during research
- Dynamic edge creation as workflow progresses
- Live particle effects showing active data flow
- Automatic layout adjustment for new nodes

**Note**: Current implementation shows historical data post-completion. Live updates during execution would require significant SSE and rendering optimizations.

---

## Known Issues (Sprint Backlog)

### Performance & Polish (P2)

| Issue | Priority | Description | Effort |
|-------|----------|-------------|--------|
| Bundle Size | P2 | Main bundle 1.2MB (recommended 500KB) | 2-4h |
| Memory Management | P3 | Completed tasks accumulate without limit | 2-3h |
| Error Display | P3 | Error messages truncated in UI | 3-4h |

### Feature Enhancement (P3)

| Issue | Priority | Description | Effort |
|-------|----------|-------------|--------|
| Multi-Query Support | P3 | Only one active query at a time | 8-12h |
| Pause/Resume | P3 | No graceful query interruption | 16-24h |
| SSE Connection Pooling | P3 | No limits on concurrent connections | 4-6h |

---

## Future Enhancements (Backlog)

### Medium Priority (P3)
- [ ] Advanced Source Filtering (relevance scoring, deduplication)
- [ ] Caching Layer (Redis for search results)
- [ ] Rate Limiting (API quota management)
- [ ] Multi-Language Support
- [ ] Alternative LLM Providers (OpenAI, Anthropic)
- [ ] Alternative Search Providers (Bing, Google Custom Search)

### Low Priority (P4)
- [ ] Authentication & User Management
- [ ] Batch Processing
- [ ] Agent Collaboration Visualization
- [ ] Predictive Progress Estimation
- [ ] Mobile Native App
- [ ] Voice Narration

---

## Priority Legend

| Priority | Meaning | Timeline |
|----------|---------|----------|
| P0 | Critical - Core agentic behavior | Immediate |
| P1 | High - Advanced agentic features | Near-term |
| P2 | Medium - Performance & polish | Mid-term |
| P3 | Low - Nice-to-have features | Long-term |
| P4 | Lowest - Deferred/optional | Future |

---

## Success Metrics

### Agentic Enhancement Targets

| Metric | Current | Target |
|--------|---------|--------|
| Claim accuracy | Unknown | > 85% |
| Source attribution | ~70% | > 95% |
| Hallucination rate | Unknown | < 10% |
| Answer completeness | ~75% | > 90% |
| Reflection improvement | N/A | +15% per iteration |
| Meta-learning effectiveness | None | Measurable over time |

---

## Documentation Reference

| Document | Purpose |
|----------|---------|
| `docs/AGENTIC_ENHANCEMENTS.md` | Detailed agentic enhancement specifications |
| `docs/SYSTEM_SPECIFICATION.md` | Current architecture reference |
| `docs/DIGITAL_HYGGE_DESIGN_GUIDE.md` | UI design system |

## Archive Reference

Historical design documents, implementation reports, and test results are preserved in:
- `docs/archive/plans/` - Original design and implementation plans
- `docs/archive/reports/` - Test reports and verification results
- `docs/archive/summaries/` - Implementation summaries
- `docs/archive/deployment/` - Docker and deployment documentation

---

## How to Contribute

1. Review `docs/AGENTIC_ENHANCEMENTS.md` for detailed specifications
2. Pick an item from the phases above
3. Check the archive for related design documents
4. Review `docs/SYSTEM_SPECIFICATION.md` for current architecture
5. Follow the Digital Hygge design system in `docs/DIGITAL_HYGGE_DESIGN_GUIDE.md`
