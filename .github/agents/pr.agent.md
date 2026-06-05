---
description: Create a pull request for the specified issue and implementation.
user-invocable: false
tools:
  [
    "execute",
    "read",
    "search",
    "todo",
    "web",
    "mcp_tavily-mcp_tavily_search",
  ]
---

Create a pull request for the given issue and implementation.

## Procedure (#tool:todo)

1. Verify that PR is ready to be created
   - Check that documentation has been updated
   - Ensure there are no uncommitted changes
  - Verify automated tests (CI) pass for both `npm run test` and `npm run test:e2e`
  - For infra/config/runtime-touching changes: verify local runtime startup succeeded with `npm run dev`
  - For infra/config/runtime-touching changes: verify minimal manual smoke checks succeeded: `GET /`, `POST /bookmarks` (valid `WRITE_SECRET`), `GET /rss.xml`
  - Verify automated test results and runtime/manual smoke results are reported distinctly
2. If the situation is deemed unsuitable for creation, provide recommendations and exit. Otherwise, create the PR.
3. Notify the user of the PR contents and link.

If required runtime startup or manual smoke checks fail, do not create the PR. Return actionable blocker details (failed check, observed error/behavior, and immediate remediation path).

## Notes

- Include the related Issue number if applicable (e.g., `Closes #<number>`)
- Leave a comment on the GitHub Issue if additional commentary is needed.

## Tools

- #tool:mcp_tavily-mcp_tavily_search: Web search
- `gh`: GitHub repository operations. Use it only with the existing `GH_TOKEN` already provisioned in the environment, and do not request broader permissions or extra auth scopes.


## Documentation

- `docs/`
- `README.md`
- `CONTRIBUTING.md`