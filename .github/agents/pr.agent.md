---
description: Create a pull request for the specified issue and implementation.
tools:
  [
    "execute",
    "read",
    "search",
    "todo",
    "web",
    "ms-vscode.vscode-websearchforcopilot/websearch",
  ]
---

Create a pull request for the given issue and implementation.

## Procedure (#tool:todo)

1. Verify that PR is ready to be created
   - Check that documentation has been updated
   - Ensure there are no uncommitted changes
   - Verify that tests (CI) pass
2. If the situation is deemed unsuitable for creation, provide recommendations and exit. Otherwise, create the PR.
3. Notify the user of the PR contents and link.

## Notes

- Include the related Issue number if applicable (e.g., `Closes #<number>`)
- Leave a comment on the GitHub Issue if additional commentary is needed.

## Tools

- #tool:ms-vscode.vscode-websearchforcopilot/websearch: Web search
- `gh`: GitHub repository operations

## Documentation

- `docs/`
- `README.md`
- `CONTRIBUTING.md`