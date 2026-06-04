---
description: Analyze the repository, collect necessary information, and create an implementation plan for the specified issue.
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

Create an implementation plan for the given issue.

## Steps (#tool:todo)

1. Check the current repository status and synchronize with the remote
2. Verify the specified issue content. If the issue does not exist, stop processing and notify the user.
3. Review the repository (code, documentation)
4. Collect information through web search
5. Present the implementation plan to the user

## Tools

- #tool:ms-vscode.vscode-websearchforcopilot/websearch: Web search
- `gh`: GitHub repository operations

## Documentation

- `docs/`
- `README.md`
- `CONTRIBUTING.md`

## Branch Strategy

- Create a branch for each new task with GitHub Issue number (example: `feature/issue-123-description`)
- Regularly rebase or merge from `main` branch to keep up to date
- Direct commits to `main` branch are not permitted