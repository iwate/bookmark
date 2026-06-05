# AGENTS.md

## Project Overview

Build a bookmark web service for @iwate.

* Single user usage
* Save page URL, thumbnail image URL, and user's comments from web pages
* Display saved data on public web pages and provide RSS feed access
* Host on Cloudflare Workers with Cloudflare D1 for persistence
* Use Hono as server framework with vanilla HTML/JS/CSS

# Philosophy

* Avoid excessive decoration.
* Prioritizing stability over novelty. 
* Choosing a method that will function without maintenance and remain problem-free even 10 years from now.

## Policies

* `docs/development-policy.md`: Coding standards, branching strategy, commit message conventions
* `docs/testing-policy.md`: Testing strategy, coverage targets
* `docs/review-policy.md`: Code review criteria, checklists
* Review/PR readiness requires both automated tests and runtime/manual validation (`npm run dev` startup, `GET /`, `POST /bookmarks` with valid `WRITE_SECRET`, `GET /rss.xml`)
* If runtime/manual validation fails, stop PR creation and report actionable blocker details

## Boundaries

* Do not modify or commit `.env*` files
* Only allow `wrangler setup/dev/d1/websearch` subcommands; no other subcommands permitted

## Tools

- #tool:ms-vscode.vscode-websearchforcopilot/websearch: Web search
- `gh`: GitHub repository operations. Use it only with the existing `GH_TOKEN` already provisioned in the environment, and DO NOT REQUEST BROADER PERMISSIONS or extra auth scopes.