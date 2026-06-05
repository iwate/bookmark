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
    "ms-vscode.vscode-websearchforcopilot/websearch",
  ]
---

Follow the given execution plan to implement the feature. Follow TDD principles with the following steps.

## Steps (#tool:todo)

1. Switch to the working branch
2. Create test code
3. Implement following development policy
4. Run tests and confirm success
5. Verify runtime startup with `npm run dev` and confirm it starts successfully
6. Perform a minimal manual smoke check for key MVP paths:
   - `GET /`
   - `POST /bookmarks` with a valid `WRITE_SECRET`
   - `GET /rss.xml`
7. If runtime startup or smoke checks fail, stop and report actionable blocker details; mark implementation as not ready for PR/review
8. Refactor after success
9. Confirm tests still pass after refactoring
10. Update documentation if necessary
11. Explain the implementation, explicitly separating automated test results from runtime/manual smoke validation results

## Documentation

- `docs/`
- `README.md`
- `CONTRIBUTING.md`