# E2E Test Suite - Research Agent

## Overview

Comprehensive E2E test suite using Playwright MCP for the Research Agent application.

**Test Coverage:**
- 115+ test scenarios across 14 categories
- 2,782 lines of test definitions
- Full chat functionality, research integration, streaming, and UI testing

## Test Files

```
tests/e2e/
├── test_regime.yml      # Main test definitions (2,782 lines)
├── test_history.json    # Test execution history tracking
├── evidence/            # Screenshots and evidence capture
├── reports/             # Test reports (HTML, JSON)
└── README.md           # This file
```

## Test Categories

| Category | Test Count | Test IDs |
|----------|-----------|----------|
| **Navigation** | 5 | NAV-001 to NAV-005 |
| **Chat Layout** | 4 | CHAT-LAYOUT-001 to 004 |
| **Conversation Management** | 5 | CONV-001 to 005 |
| **Chat Input** | 7 | INPUT-001 to 007 |
| **Chat Thread** | 5 | THREAD-001 to 005 |
| **Research Integration** | 5 | RESEARCH-001 to 005 |
| **Research Suggestions** | 3 | SUGGEST-001 to 003 |
| **Research Page** | 3 | RSRCH-001 to 003 |
| **Logs Page** | 4 | LOGS-001 to 004 |
| **Evaluation Dashboard** | 4 | EVAL-001 to 004 |
| **Error Handling** | 3 | ERR-001 to 003 |
| **Accessibility** | 3 | A11Y-001 to 003 |
| **Mobile Responsiveness** | 3 | MOBILE-001 to 003 |
| **Comprehensive Chat** | 57 | CHAT-MSG-001 to CHAT-EDGE-007 |

### Comprehensive Chat Tests Breakdown

| Sub-category | Count | Test IDs |
|-------------|-------|----------|
| Message Flow & State | 7 | CHAT-MSG-001 to 007 |
| Conversation Lifecycle | 9 | CHAT-CONV-001 to 009 |
| Streaming & Real-time | 7 | CHAT-STREAM-001 to 007 |
| Research Mode Advanced | 8 | CHAT-RESEARCH-001 to 008 |
| Research Suggestions | 5 | CHAT-SUGGEST-001 to 005 |
| Markdown Rendering | 4 | CHAT-MARKDOWN-001 to 004 |
| Timestamps | 2 | CHAT-TIME-001 to 002 |
| Error States | 5 | CHAT-ERR-001 to 005 |
| Mobile Sidebar | 3 | CHAT-MOBILE-001 to 003 |
| Edge Cases | 7 | CHAT-EDGE-001 to 007 |

## Prerequisites

Before running tests, ensure:

1. **PostgreSQL** running: `docker-compose up -d postgres`
2. **Database migrations** applied: `npm run migration:run`
3. **Backend server** running: `npm run start:dev` (port 3000)
4. **Frontend server** running: `npm run client:dev` (port 4200)
5. **LLM provider** configured: Ollama (`ollama serve`) or Azure Mistral in `.env`
6. **Playwright MCP** configured in Claude settings

### Quick Start Servers

```bash
# Terminal 1: Start backend
npm run start:dev

# Terminal 2: Start frontend
cd client && npm run start

# Or use concurrently (single terminal)
npm run dev
```

## Test Execution

The test suite should be executed using the **e2e-testing skill** in Claude Code.

### Running Tests

In a Claude Code session:

```
Use the e2e-testing skill in "Run" mode to execute the test suite at tests/e2e/test_regime.yml
```

The skill will:
1. Load the test regime from `test_regime.yml`
2. Execute scenarios sequentially
3. Capture evidence (screenshots, network logs, console logs)
4. Generate both human and machine-readable reports
5. Update test history for flaky test detection

## Test Regime Structure

The test regime uses a YAML-based format with the following structure:

```yaml
metadata:
  name: Research Agent E2E Test Suite
  version: "1.0.0"
  base_url: http://localhost:4200

scenarios:
  - id: TEST-001
    name: Test Name
    description: What this test does
    preconditions:
      - Any setup requirements
    blocking: true/false  # Does failure block other tests?
    steps:
      - action: navigate/click/type/verify
        element: selector
        flexibility: exact/contains/ai_judgment
    success_criteria:
      - type: expected_outcome
        flexibility: exact/ai_judgment
    alternatives:
      - Alternative approach if primary fails
```

## Flexibility Criteria

Tests use three flexibility levels:

| Type | Evaluation |
|------|------------|
| `exact` | String/value must match exactly |
| `contains` | Target must contain specified text |
| `ai_judgment` | AI reasoning: "Does this accomplish [goal]?" |

## Evidence Capture

For each test step, evidence is captured:

```
evidence/
  scenario-name/
    step-01/
      screenshot.png
      dom-snapshot.html
      network-log.json
      console-log.txt
      accessibility-snapshot.yaml
```

## Reports

After execution, reports are generated:

### Human-Readable Report
`reports/YYYY-MM-DD-HHmmss-report.md`
- Summary statistics
- Failure details with reproduction steps
- Discovered paths
- Flaky areas analysis
- Suggested new tests

### Machine-Readable Report
`reports/YYYY-MM-DD-HHmmss-report.json`
- Structured test results
- Evidence paths
- Reproduction commands
- History analysis
- Actionable suggestions

## Test History

`test_history.json` tracks:
- Previous run results
- Flaky scenarios (inconsistent pass/fail)
- Regressions (newly failing tests)
- Suggested test variations

## Key Test Scenarios

### Critical Path (Blocking Tests)
- `health-check`: Backend/frontend availability
- `navigation-header`: All navigation links functional

### Chat Functionality Highlights
- **CHAT-MSG-001**: Complete message send/receive cycle
- **CHAT-STREAM-001**: Progressive streaming updates
- **CHAT-RESEARCH-004**: Citations appear after research
- **CHAT-EDGE-004**: Page refresh during streaming recovery

### Research Integration
- **RESEARCH-001**: Research mode execution with SSE
- **RESEARCH-003**: Citation click opens panel with highlighting
- **SUGGEST-001**: Factual question detection triggers suggestions

## Test Execution Time Estimates

| Category | Estimated Time |
|----------|---------------|
| Navigation tests | ~2 minutes |
| Chat layout tests | ~3 minutes |
| Message flow tests | ~15 minutes |
| Streaming tests | ~20 minutes |
| Research integration | ~25 minutes |
| Full comprehensive suite | ~90-120 minutes |

**Note:** Actual time depends on LLM response times (Azure Mistral faster than Ollama)

## Troubleshooting

### Tests Failing to Start

**Symptom:** Playwright cannot connect
**Solution:** Verify Playwright MCP in Claude settings:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

### Tests Timeout on Streaming

**Symptom:** Tests timeout waiting for assistant responses
**Solution:**
- Check LLM provider is running (Ollama or Azure Mistral)
- Verify `.env` configuration
- Increase timeout in test_regime.yml if needed

### Network Errors During Tests

**Symptom:** API calls fail with 500/404
**Solution:**
- Ensure backend is running on port 3000
- Check database migrations applied
- Verify `.env` has required API keys (TAVILY_API_KEY)

## Next Steps After First Run

1. **Review flaky tests** in test history
2. **Add suggested variations** to test regime
3. **Update regime** with discovered alternative paths
4. **Iterate** on failing tests to improve reliability

## Reference Documentation

- E2E Testing Skill: `~/.claude/skills/e2e-testing/README.md`
- Test Regime Schema: `~/.claude/skills/e2e-testing/references/test-regime-schema.md`
- Application Docs: `README.md`, `CLAUDE.md`
