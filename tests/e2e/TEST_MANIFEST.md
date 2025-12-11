# E2E Test Suite Manifest

**Created:** 2025-12-10
**Application:** Research Agent (NestJS + Angular)
**Base URL:** http://localhost:4200

## Files Created

| File | Purpose | Lines | Status |
|------|---------|-------|--------|
| `test_regime.yml` | Main test definitions | 2,782 | ✅ Ready |
| `test_history.json` | Execution history tracking | 20 | ✅ Initialized |
| `README.md` | Test suite documentation | 234 | ✅ Complete |
| `TEST_SUMMARY.md` | Test breakdown summary | 158 | ✅ Complete |
| `EXECUTE_TESTS.txt` | Copy-paste prompt for new session | 108 | ✅ Ready |
| `RUN_TESTS_PROMPT.md` | Detailed execution instructions | 76 | ✅ Complete |
| `start-servers.sh` | Server startup script | 38 | ✅ Executable |
| `TEST_MANIFEST.md` | This file | - | ✅ Complete |

## Directory Structure

```
tests/e2e/
├── test_regime.yml           # Test definitions (MAIN FILE)
├── test_history.json         # History tracking (will populate after runs)
├── README.md                 # Documentation
├── TEST_SUMMARY.md           # Test breakdown
├── TEST_MANIFEST.md          # This manifest
├── EXECUTE_TESTS.txt         # Copy-paste prompt
├── RUN_TESTS_PROMPT.md       # Execution guide
├── start-servers.sh          # Server startup script
├── evidence/                 # Evidence capture (populated during runs)
│   └── (scenario-name)/
│       └── step-XX/
│           ├── screenshot.png
│           ├── network-log.json
│           └── console-log.txt
└── reports/                  # Test reports (populated after runs)
    ├── YYYY-MM-DD-HHmmss-report.md
    └── YYYY-MM-DD-HHmmss-report.json
```

## Test Categories

### 1. Navigation (5 tests)
- Header links visibility and functionality
- Logo return to home
- All page navigation

### 2. Chat Layout (4 tests)
- Sidebar structure
- Main area structure
- Empty state display
- Input component structure

### 3. Conversation Management (5 tests)
- Create conversation (explicit button)
- Create via first message (implicit)
- Search conversations
- Delete conversation
- Select conversation

### 4. Chat Input (7 tests)
- Send button state (disabled when empty)
- Research toggle default (OFF)
- Research toggle activation
- Research toggle resets after send
- Ctrl+Enter keyboard shortcut
- Shift+Enter for newline
- Textarea auto-resize

### 5. Chat Thread (5 tests)
- Message display structure (user right, assistant left)
- Markdown rendering
- Streaming response display
- Auto-scroll to new messages
- Empty thread state

### 6. Research Integration (5 tests)
- Send message with research enabled
- Research side panel structure
- Citation click opens panel
- Research progress stages
- Close research panel

### 7. Research Suggestions (3 tests)
- Factual question shows suggestion
- Temporal query shows suggestion
- Click suggestion triggers research

### 8. Research Page (3 tests)
- Research page layout
- Submit research query
- Character count display

### 9. Logs Page (4 tests)
- Logs page layout
- View session details
- Toggle timeline/graph view
- Quality inspector link

### 10. Evaluation Dashboard (4 tests)
- Dashboard statistics display
- Evaluation records table
- Filter evaluations
- Pagination

### 11. Error Handling (3 tests)
- API error display
- Dismiss error
- Streaming error recovery

### 12. Accessibility (3 tests)
- Keyboard navigation
- ARIA labels present
- Screen reader landmarks

### 13. Mobile (3 tests)
- Sidebar collapse on mobile
- Toggle sidebar on mobile
- Research panel on mobile

### 14. Comprehensive Chat (57 tests)

#### Message Flow & State (7)
Tests complete message lifecycle, consecutive messages, persistence, validation, edge cases

#### Conversation Lifecycle (9)
Tests auto-title generation, URL routing, switching, deletion scenarios, search debouncing

#### Streaming & Real-time (7)
Tests progressive streaming, connection states, auto-scroll, persistence, error recovery

#### Research Mode Advanced (8)
Tests toggle states, panel behavior, citations, tooltips, keyboard navigation, external links

#### Research Suggestions (5)
Tests factual/temporal detection patterns, no duplicates, re-submission, assistant recommendations

#### Markdown Rendering (4)
Tests code blocks, lists, links, XSS prevention

#### Timestamps (2)
Tests relative time formatting in messages and sidebar

#### Error States (5)
Tests load errors, send errors, delete errors, create errors, error dismissal

#### Mobile Sidebar (3)
Tests auto-hide, toggle persistence, research panel on mobile

#### Edge Cases (7)
Tests empty states, rapid sending, browser navigation, refresh during stream, title truncation, invalid IDs, concurrent tabs

## Blocking Dependencies

Critical tests that block others if they fail:

- `health-check` → Blocks all tests
- `navigation-header` → Blocks all page-specific tests

## Execution Configuration

```yaml
parallel: false                    # Sequential execution
retry_failed: 2                    # Retry failed tests twice
screenshot_on_failure: true        # Always capture failure evidence
video_recording: false             # No video (screenshots sufficient)
timeout_defaults:
  navigation: 10000ms
  action: 5000ms
  assertion: 3000ms
  streaming: 120000ms              # 2 minutes for LLM responses
```

## Success Criteria Types

Tests use flexible success criteria:

- `exact`: Precise match required
- `contains`: Partial match acceptable
- `ai_judgment`: AI evaluates if goal achieved

## How to Use This Test Suite

### Quick Start

1. Read `EXECUTE_TESTS.txt`
2. Copy the prompt
3. Paste into new Claude Code session
4. Skill will handle everything

### Manual Execution

1. Start servers: `./tests/e2e/start-servers.sh`
2. In Claude Code: "Use e2e-testing skill to run tests/e2e/test_regime.yml"
3. Wait for completion
4. Review reports in `tests/e2e/reports/`

### Targeted Testing

Run specific categories:
```
Run e2e-testing skill on tests/e2e/test_regime.yml, categories: chat_comprehensive, research_integration
```

Run specific scenarios:
```
Run e2e-testing skill on tests/e2e/test_regime.yml, scenarios: CHAT-MSG-001, CHAT-STREAM-001, RESEARCH-001
```

## Expected Outcomes

### First Run
- Some tests may fail due to environmental setup
- Flaky tests will be identified
- Baseline established in test_history.json

### Subsequent Runs
- Compare against history
- Detect regressions
- Track flaky patterns
- Suggest test variations

## Report Interpretation

### Human Report (`*.md`)
- Executive summary
- Failure details with reproduction steps
- Evidence file paths
- Suggested investigations
- Discovered alternative paths

### Machine Report (`*.json`)
- Structured data for automation
- Playwright reproduction commands
- History analysis (regressions, flaky, persistent)
- Actionable suggestions for bug-fix skills

## Maintenance

### After Each Run
- Review flaky scenarios
- Update test regime with discovered paths
- Add suggested variations for flaky areas
- Document any new edge cases found

### After Code Changes
- Re-run affected test categories
- Compare results to previous runs
- Identify regressions
- Update tests if behavior intentionally changed

## Contact & Support

For issues with the test suite:
- Check `tests/e2e/README.md` for troubleshooting
- Review E2E Testing Skill docs: `~/.claude/skills/e2e-testing/`
- Verify Playwright MCP configuration in Claude settings

---

**Test Suite Version:** 1.0.0
**Last Updated:** 2025-12-10
**Status:** Ready for execution
