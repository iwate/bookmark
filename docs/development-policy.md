# Development Policy

## Overview
This document outlines the development standards and best practices for our JavaScript application running on Cloudflare Workers with Cloudflare D1 database.

## Coding Standards

### JavaScript Style Guide
- Use **ES2025+** features (async/await, optional chaining, nullish coalescing)
- Enforce **ESLint** with our standard configuration
- Format code with **Prettier** (2-space indentation)
- Use **TypeScript aggressively** for type safety and development experience
- Rely on **JavaScript runtime type stripping** (no tsc compilation step)
- Prefer `const` over `let`, avoid `var`

### Code Organization
```
src/
├── handlers/       # Request handlers
├── services/       # Business logic
├── utils/          # Utility functions
├── middleware/     # Middleware functions
├── db/            # Database queries
└── types/         # TypeScript type definitions
```

### Naming Conventions
- **Variables/Functions**: camelCase
- **Classes/Types**: PascalCase
- **Constants**: UPPER_SNAKE_CASE
- **Files**: kebab-case for utilities, PascalCase for classes

### Best Practices
- Keep functions small and focused (single responsibility)
- Use descriptive variable and function names
- Add JSDoc comments for public functions
- Handle errors explicitly with try-catch or error handlers
- Use async/await instead of .then().catch()
- Avoid callback hell

## Branching Strategy (Git Flow)

### Branch Types
- **main**: Production-ready code (protected)
- **staging**: Pre-production testing
- **develop**: Integration branch for features
- **feature/***: Feature development (e.g., `feature/user-auth`)
- **bugfix/***: Bug fixes (e.g., `bugfix/db-connection`)
- **hotfix/***: Critical production fixes (e.g., `hotfix/api-timeout`)

### Branch Rules
1. All changes must go through Pull Request
2. Require at least 1 code review before merge
3. CI/CD checks must pass
4. Squash commits on merge to develop
5. Use conventional commits on main

## Commit Message Conventions

Follow **Conventional Commits** format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type
- **feat**: New feature
- **fix**: Bug fix
- **refactor**: Code refactoring without changing functionality
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **docs**: Documentation changes
- **chore**: Dependency updates, build config changes
- **ci**: CI/CD configuration changes

### Scope (Optional but Recommended)
- handler
- service
- database
- middleware
- auth
- validation

### Subject Rules
- Use imperative mood ("add" not "added")
- Do not capitalize first letter
- No period (.) at the end
- Maximum 50 characters

### Examples
```
feat(auth): add jwt token validation
fix(database): handle d1 connection timeout
refactor(handlers): simplify user endpoint logic
docs(readme): update installation instructions
```

### Body (Optional for simple commits)
- Explain **what** and **why**, not **how**
- Wrap at 72 characters
- Use bullet points for multiple changes

### Footer
- Reference issues: `Closes #123` or `Fixes #456`
- Breaking changes: `BREAKING CHANGE: description`

## Database (Cloudflare D1)

### Query Standards
- Use parameterized queries to prevent SQL injection
- Always handle errors from database calls
- Keep queries efficient; use indexes on frequently queried columns

```javascript
// ✓ Good
const result = await db.prepare(
  'SELECT * FROM users WHERE id = ?'
).bind(userId).all();

// ✗ Bad
const result = await db.prepare(
  `SELECT * FROM users WHERE id = '${userId}'`
).all();
```

### Migrations
- Create migrations for all schema changes
- Migrations are versioned and tracked
- Test migrations locally before deploying

## Testing

### Test Coverage
- Unit tests for business logic (services)
- Integration tests for API endpoints
- Minimum 70% code coverage for critical paths
- Use **Jest** or **Vitest** for testing

### Runtime & Manual Smoke Validation (PR Readiness)
- Automated readiness requires both commands to pass:
  - `npm run test`
  - `npm run test:e2e`
- Manual runtime startup and smoke validation are required only for infra/config/runtime-touching changes.
- Infra/config/runtime-touching examples:
  - Worker runtime/bootstrap/routing changes
  - `wrangler.toml` or binding/secret handling changes
  - D1 schema/migration/runtime DB wiring changes
  - CI/deployment/runtime environment configuration changes
- For those changes, verify local runtime startup with `npm run dev` and run a minimal manual smoke check:
  - `GET /`
  - `POST /bookmarks` with a valid `WRITE_SECRET`
  - `GET /rss.xml`
- If required runtime startup or smoke checks fail, stop PR/review readiness work and document actionable blocker details (failing command/path, observed behavior, and immediate next fix).

### File Naming
- Test files: `*.test.ts` or `*.spec.ts`
- Colocate tests near source files

## Pull Request Process

1. Create a feature branch from `develop`
2. Make atomic commits with conventional messages
3. Open PR with descriptive title and body
4. Reference related issues
5. Ensure CI/CD passes
6. Request review from team members
7. Address review feedback
8. Squash and merge to develop
9. Delete feature branch after merge

### PR Title Format
```
[type]: Short description

- Feature detail 1
- Feature detail 2

Closes #123
```

## Code Review Checklist

- [ ] Code follows coding standards
- [ ] No security vulnerabilities
- [ ] Error handling is appropriate
- [ ] Database queries are optimized
- [ ] Tests are included/updated
- [ ] `npm run test` passes
- [ ] `npm run test:e2e` passes
- [ ] For infra/config/runtime-touching changes: local runtime startup verified with `npm run dev`
- [ ] For infra/config/runtime-touching changes: manual smoke check verified for `GET /`, `POST /bookmarks` (valid `WRITE_SECRET`), and `GET /rss.xml`
- [ ] Documentation is updated
- [ ] No hardcoded credentials or secrets

## Environment Configuration

- Use `wrangler.toml` for Cloudflare configuration
- Store secrets in `.dev.vars` (development) and Cloudflare dashboard (production)
- Never commit `.dev.vars` or sensitive credentials
- Document all required environment variables

## Deployment

- Production deployments only from `main` branch
- Staging deployments from `staging` branch
- Use CI/CD pipeline for automated testing and deployment
- Tag releases with semantic versioning: `v1.0.0`
- Document breaking changes in release notes

## Tools & Configuration

- **Linter**: ESLint
- **Formatter**: Prettier
- **Testing**: Vitest
- **Build**: Wrangler CLI
- **Version Control**: Git
- **Package Manager**: npm
