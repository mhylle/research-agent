# E2E Test Execution Prompt

Use this prompt to run the comprehensive E2E test suite in a new Claude Code session.

---

## Prompt

```
I need you to run the comprehensive E2E test suite for the Research Agent application.

Context:
- Working directory: /home/mnh/projects/research-agent
- Test regime location: tests/e2e/test_regime.yml
- Test history: tests/e2e/test_history.json
- Application: Multi-stage LLM research agent with NestJS backend (port 3000) and Angular frontend (port 4200)

Prerequisites to start:
1. Start PostgreSQL: docker-compose up -d postgres
2. Run migrations: npm run migration:run
3. Start servers: npm run dev (this starts both backend on 3000 and frontend on 4200)
4. Wait 30 seconds for servers to be ready

After servers are running:
Use the e2e-testing skill in "Run" mode to execute the test suite.

The test regime at tests/e2e/test_regime.yml contains 115+ test scenarios covering:
- Navigation (5 tests)
- Chat layout and functionality (4 tests)
- Conversation management (5 tests)
- Chat input validation (7 tests)
- Chat threading and display (5 tests)
- Research integration (5 tests)
- Research suggestions (3 tests)
- Research page (3 tests)
- Logs page (4 tests)
- Evaluation dashboard (4 tests)
- Error handling (3 tests)
- Accessibility (3 tests)
- Mobile responsiveness (3 tests)
- Comprehensive chat tests (57 tests covering edge cases, streaming, citations, markdown, errors, mobile)

Important notes:
- Tests should run sequentially (not parallel)
- Capture screenshots on every step
- Generate both human-readable (markdown) and machine-readable (JSON) reports
- Save evidence to tests/e2e/evidence/
- Save reports to tests/e2e/reports/
- Update test_history.json after completion

Expected execution time: 90-120 minutes for full suite

After tests complete, provide:
1. Summary of pass/fail counts
2. List of critical failures
3. Identified flaky tests
4. Regressions (if any)
5. Path to generated reports
```

---

## Alternative: Run Specific Test Categories

If you want to run only specific categories:

```
Run the e2e-testing skill on the Research Agent test suite (tests/e2e/test_regime.yml), but only execute tests in the following categories:
- chat_comprehensive (57 tests covering all chat functionality)

[or specify other categories: navigation, conversation_management, research_integration, etc.]
```

## Alternative: Quick Smoke Test

For a quick validation:

```
Run the e2e-testing skill on the Research Agent test suite, executing only these critical scenarios:
- health-check (NAV-001)
- navigation-header (NAV-002 to NAV-005)
- CHAT-MSG-001 (Complete message flow)
- CHAT-STREAM-001 (Streaming updates)
- RESEARCH-001 (Research with SSE)

This will verify core functionality in ~10-15 minutes.
```
