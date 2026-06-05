# Code Review Policy

## Overview
This document outlines the code review standards and requirements for our JavaScript application running on Cloudflare Workers with Cloudflare D1 database. All code submissions must follow these review guidelines to ensure code quality, security, and adherence to project standards.

Code under review has already passed development standards (see Development Policy) and testing requirements (see Testing Policy). Reviewers should verify this and ensure overall code quality and architectural fit.

## Review Process

### When to Request Review
- After all tests pass locally and in CI/CD
- After both automated commands pass:
	- `npm run test`
	- `npm run test:e2e`
- For infra/config/runtime-touching changes only: after local runtime startup is verified with `npm run dev`
- For infra/config/runtime-touching changes only: after minimal manual smoke checks pass for `GET /`, `POST /bookmarks` (valid `WRITE_SECRET`), and `GET /rss.xml`
- After code follows Development Policy standards (ESLint, Prettier, TypeScript)
- After test coverage thresholds are met (80% minimum)
- After addressing any pre-commit checks

### Reviewer Assignment
- Request at least 1 reviewer (minimum requirement)
- Assign reviewers with domain expertise for the change
- For security-sensitive code, assign a security-focused reviewer
- For database changes, assign someone with D1 experience

### Review Timeline
- Target first review: Within 24 hours of PR creation
- Target resolution: Within 3 business days
- Critical/hotfix PRs: Expedited review within 4 hours

## Review Checklist

### Development Standards Verification
- [ ] Code follows ESLint configuration (no linting errors)
- [ ] Code is formatted with Prettier (2-space indentation)
- [ ] TypeScript types are properly defined (no `any` unless justified)
- [ ] Variable/function naming follows conventions (camelCase/PascalCase)
- [ ] Functions are focused with single responsibility
- [ ] JSDoc comments present for public functions
- [ ] No unused imports or variables

### Testing Requirements Verification
- [ ] All tests pass in CI/CD pipeline
- [ ] Coverage meets minimum thresholds (80% statements/functions, 75% branches, 80% lines)
- [ ] New code has corresponding test coverage
- [ ] Modified code has updated tests
- [ ] Critical paths have 100% coverage (auth, DB, error handling)
- [ ] Error cases are tested
- [ ] Security-sensitive code has security tests

### Runtime & Smoke Validation Verification
- [ ] `npm run test` passed
- [ ] `npm run test:e2e` passed
- [ ] For infra/config/runtime-touching changes: local runtime startup was verified with `npm run dev`
- [ ] For infra/config/runtime-touching changes: manual smoke validation was performed for `GET /`, `POST /bookmarks` (valid `WRITE_SECRET`), and `GET /rss.xml`
- [ ] Runtime/manual smoke validation results are reported separately from automated test results
- [ ] If required runtime/manual smoke checks failed, PR is marked not-ready until blocker details and fixes are provided

### Code Quality Review
- [ ] Logic is clear and easy to understand
- [ ] Error handling is explicit and comprehensive
- [ ] No hardcoded values (magic numbers, URLs, etc.)
- [ ] Performance implications considered
- [ ] Database queries use parameterized queries
- [ ] No N+1 queries or inefficient data access patterns
- [ ] Appropriate logging added for debugging

### Security Review
- [ ] No SQL injection vulnerabilities (parameterized queries used)
- [ ] No XSS vulnerabilities (input validation, output escaping)
- [ ] Authentication/authorization checks in place
- [ ] No sensitive data logged or exposed in errors
- [ ] No hardcoded credentials or secrets
- [ ] Input validation and sanitization applied
- [ ] Rate limiting considered for public endpoints

### Architecture & Design Review
- [ ] Code fits within established directory structure
- [ ] Follows established patterns and conventions
- [ ] Minimal coupling between components
- [ ] Appropriate use of middleware and handlers
- [ ] Database access properly abstracted
- [ ] No circular dependencies

### Branch & Commit Standards
- [ ] Branch name follows convention (feature/*, bugfix/*, hotfix/*)
- [ ] Commits follow Conventional Commits format
- [ ] Commit messages are clear and descriptive
- [ ] Commits are atomic (one logical change per commit)
- [ ] PR title follows format: `[type]: Description`
- [ ] Related issues are referenced in PR body

### Documentation Review
- [ ] JSDoc comments are accurate and complete
- [ ] Complex logic is explained in comments
- [ ] README updated if required
- [ ] Configuration changes documented
- [ ] Test data and fixtures documented if complex
- [ ] Environment variables documented

### Database Changes
- [ ] Schema changes include migrations
- [ ] Migrations tested locally
- [ ] Backward compatibility considered
- [ ] Index strategy reviewed for performance
- [ ] Transaction handling appropriate
- [ ] Connection pooling considered

## Common Review Comments

### Code Quality Issues
- "Consider extracting this logic into a separate function for reusability"
- "This function is doing too much - please split into smaller functions"
- "Add error handling for this async operation"
- "Use const instead of let - reassignment not needed"

### Security Issues
- "This query should use parameterized queries to prevent SQL injection"
- "Input validation needed before using this user-supplied value"
- "Remove hardcoded credentials - use environment variables"
- "This error message exposes sensitive information"

### Testing Issues
- "This function should have a test case for the error scenario"
- "Add test coverage for this new code path"
- "This mock needs better isolation to prevent test interdependence"

### Documentation Issues
- "Add JSDoc comment explaining the purpose of this function"
- "Document why this specific mocking strategy is needed"
- "Add inline comments explaining this complex algorithm"

## Review Feedback Guidelines

### For Reviewers
- Be respectful and constructive in feedback
- Explain **why** a change is needed, not just that it is
- Suggest solutions, don't just point out problems
- Acknowledge good practices and effort
- Review promptly to avoid blocking progress
- Ask clarifying questions if logic is unclear
- Use comments for suggestions, request changes for requirements

### For Authors
- Respond to all feedback (acknowledge or address)
- Ask questions if feedback is unclear
- Don't take criticism personally - focus on code quality
- Update PR after addressing feedback
- Request re-review after making changes
- Reference specific commits when addressing comments

## Approval Criteria

A PR is ready to merge when:

- [ ] At least 1 reviewer has approved
- [ ] All review feedback is addressed
- [ ] All CI/CD checks pass
- [ ] `npm run test` and `npm run test:e2e` are confirmed
- [ ] For infra/config/runtime-touching changes: local runtime startup and manual MVP smoke checks are confirmed
- [ ] Code coverage thresholds maintained or improved
- [ ] No merge conflicts
- [ ] Branch is up to date with target branch

## Special Review Cases

### Security-Sensitive Code
- Requires security-focused review
- Review authentication/authorization logic carefully
- Verify input validation and output encoding
- Check for common vulnerabilities (SQL injection, XSS, CSRF)
- Ensure sensitive data handling is secure

### Database Migration Reviews
- Verify migration is reversible if possible
- Check for data loss risks
- Verify performance impact for large tables
- Ensure downtime is minimal
- Test rollback procedure

### Performance-Critical Code
- Review algorithm complexity
- Check for obvious inefficiencies
- Verify database query optimization
- Consider caching strategies
- Review response time targets

### Large/Complex PRs
- Consider requesting focused review (e.g., security, performance)
- Request re-review after major revisions
- Break into smaller PRs if possible
- Provide clear context in PR description

## Code Review Tools & Practices

### GitHub Review Features
- Use "Request Changes" for blocking issues
- Use "Comment" for questions or suggestions
- Use "Approve" when satisfied with quality
- Use diff view to understand context
- Start a review before publishing comments

### Review Workflow
1. Read PR description and understand intent
2. Check CI/CD status and coverage reports
3. Review commits in order for logical flow
4. Examine diff with context
5. Test locally if complex logic (optional)
6. Provide structured feedback
7. Submit review with decision

## Merge Strategy

- **Squash and merge** to develop branch (clean history)
- **Create merge commit** to main/staging (preserve branch structure)
- Delete feature branch after merge
- Ensure commit message is descriptive for main branch

## Continuous Improvement

### Metrics to Track
- Average review time
- Number of revisions per PR
- Common feedback themes
- Bug escape rate (issues found after merge)

### Process Improvements
- Document frequently raised issues
- Update Development Policy based on common feedback
- Share learnings in team meetings
- Refine review checklist based on experience

## Resources

- [Development Policy](./development-policy.md) - Coding standards and conventions
- [Testing Policy](./testing-policy.md) - Testing requirements and standards
- [GitHub PR Best Practices](https://github.com/features/code-review)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [OWASP Code Review Guide](https://owasp.org/www-project-code-review-guide/)
