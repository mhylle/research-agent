# Prompt for Workflow Testing Session

Copy and paste this to start the testing session:

---

## Start Prompt

```
Read docs/context/WORKFLOW-TESTING-METHODOLOGY.md first.

Execute the Research Agent workflow test with these rules:

1. **Test Query**: "What is happening in Aarhus next weekend?"
2. **Sequential Testing**: Test each stage in order (1-8), never skip
3. **Fix Before Proceeding**: Any error MUST be fixed before moving to next stage
4. **Start from Beginning**: When testing stage N, execute stages 1 to N-1 first
5. **Subagent Delegation**: Use subagents for isolated investigation tasks
6. **Final Validation**: Use Playwright MCP to verify in browser:
   - Result visible (not loading forever)
   - Tool calls > 0
   - Status = "completed"
   - Sources displayed

Begin with Stage 1: Submit the test query via API and verify logId is returned.

After every 3-4 tool calls, remind yourself of these rules and current progress.
```

---

## Quick Reference Card

| Stage | What | Verify |
|-------|------|--------|
| 1 | POST /api/research/query | logId returned |
| 2 | Plan creation | No 3230 errors, plan has phases |
| 3 | Search execution | Results > 0 |
| 4 | Fetch execution | Content retrieved |
| 5 | Source extraction | Sources > 0 in logs |
| 6 | Synthesis | Answer generated, not stuck |
| 7 | Storage | Result in database |
| 8 | Browser (Playwright) | All UI criteria pass |

## Critical Reminders

- **NEVER** skip stages
- **ALWAYS** fix errors before proceeding
- **ALWAYS** use the exact test query
- **ALWAYS** end with Playwright browser validation
- **DELEGATE** isolated tasks to subagents
