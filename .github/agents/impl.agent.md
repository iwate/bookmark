---
description: Execute implementation based on the specified plan following TDD principles.
user-invocable: false
tools:
  [
    "execute",
    "edit",
    "read",
    "search",
    "todo",
    "web",
    "mcp_tavily-mcp_tavily_search",
  ]
---

Follow the given execution plan to implement the feature. Follow TDD principles with the following steps.

## Steps (#tool:todo)

1. Switch to the working branch
2. Create test code
3. Implement following development policy
4. Run automated tests and confirm both commands succeed:
  - `npm run test`
  - `npm run test:e2e`
5. For infra/config/runtime-touching changes, verify runtime startup with `npm run dev` and confirm it starts successfully
6. For infra/config/runtime-touching changes, perform a minimal manual smoke check for key MVP paths:
   - `GET /`
   - `POST /bookmarks` with a valid `WRITE_SECRET`
   - `GET /rss.xml`
7. If required runtime startup or smoke checks fail, stop and report actionable blocker details; mark implementation as not ready for PR/review
8. Refactor after success
9. Confirm tests still pass after refactoring
10. Update documentation if necessary
11. Explain the implementation, explicitly separating automated test results from runtime/manual smoke validation results

## Documentation

- `docs/`
- `README.md`
- `CONTRIBUTING.md`