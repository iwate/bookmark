# Testing Policy

## Overview
This document outlines the testing standards and requirements for our JavaScript application running on Cloudflare Workers with Cloudflare D1 database. All code must follow these testing guidelines to ensure code quality, reliability, and maintainability.

## Testing Framework & Tools

- **Framework**: Vitest
- **Coverage Tool**: Vitest coverage reporting
- **Mocking**: Vitest mocking utilities and `@cloudflare/workers-types`
- **Assertion Library**: Vitest built-in assertions
- **Database Testing**: D1 mock/test database

## Test File Organization

### File Naming Conventions
- Test files: `*.test.ts` or `*.test.js`
- Colocate test files with source files or in parallel `__tests__` directories
- Example structure:
```
src/
├── handlers/
│   ├── user.ts
│   └── user.test.ts
├── services/
│   ├── authService.ts
│   └── authService.test.ts
├── db/
│   ├── queries.ts
│   └── queries.test.ts
```

### Test Execution
- Run tests: `npm test`
- Run end-to-end tests: `npm run test:e2e`
- Run tests with coverage: `npm test -- --coverage`
- Watch mode: `npm test -- --watch`

### Runtime Startup & Manual Smoke Validation
- Automated PR/readiness gates require both `npm run test` and `npm run test:e2e`.
- Manual runtime startup and smoke validation are conditional and required only for infra/config/runtime-touching changes.
- For those changes, confirm local runtime startup with `npm run dev` and perform a minimal smoke check of key MVP paths:
  - `GET /`
  - `POST /bookmarks` with a valid `WRITE_SECRET`
  - `GET /rss.xml`
- If required runtime startup or smoke checks fail, stop PR readiness work and report actionable blocker details (failed command/path, observed error, and next fix).

## Test Coverage Requirements

### Minimum Coverage Thresholds
- **Statements**: 80% minimum
- **Branches**: 75% minimum
- **Functions**: 80% minimum
- **Lines**: 80% minimum

### Critical Paths (Must have 100% coverage)
- Authentication & authorization logic
- Database query operations
- Error handling in handlers
- Data validation and sanitization
- Security-related utilities

### Coverage Configuration
```javascript
// vitest.config.ts
export default {
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      all: true,
      include: ['src/**/*.{ts,js}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },
  },
};
```

## Unit Testing Standards

### Test Structure (Arrange-Act-Assert)
```typescript
describe('UserService', () => {
  it('should create a new user with valid data', () => {
    // Arrange
    const userData = { name: 'John', email: 'john@example.com' };
    
    // Act
    const user = createUser(userData);
    
    // Assert
    expect(user.id).toBeDefined();
    expect(user.name).toBe('John');
  });
});
```

### Requirements
- Each test must test a single behavior
- Use descriptive test names following: "should [expected behavior] when [condition]"
- Include both success and failure cases
- Mock external dependencies
- Do not rely on test execution order
- Clean up resources after each test (use beforeEach/afterEach)

### Example Test Cases
```typescript
describe('validateEmail', () => {
  it('should return true for valid email addresses', () => {
    expect(validateEmail('user@example.com')).toBe(true);
  });

  it('should return false for invalid email addresses', () => {
    expect(validateEmail('invalid-email')).toBe(false);
  });

  it('should handle edge cases like empty strings', () => {
    expect(validateEmail('')).toBe(false);
  });
});
```

## Integration Testing Standards

### API Endpoint Testing
- Test complete request-response cycle
- Mock database layer
- Verify HTTP status codes and response format
- Test error responses (4xx, 5xx)
- Validate response headers

```typescript
describe('POST /api/users', () => {
  it('should create a user and return 201', async () => {
    const response = await testRequest('POST', '/api/users', {
      name: 'John',
      email: 'john@example.com',
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
  });

  it('should return 400 for invalid input', async () => {
    const response = await testRequest('POST', '/api/users', {
      name: '', // Invalid
    });

    expect(response.status).toBe(400);
  });
});
```

### Database Testing
- Use test-specific D1 database or mocks
- Test query correctness with various data states
- Test transaction handling
- Verify error handling for connection failures

```typescript
describe('getUserById', () => {
  it('should fetch user by id from database', async () => {
    const userId = 'test-id';
    const user = await getUserById(userId);

    expect(user).toBeDefined();
    expect(user.id).toBe(userId);
  });

  it('should return null for non-existent user', async () => {
    const user = await getUserById('non-existent');
    expect(user).toBeNull();
  });
});
```

## Mocking Standards

### External Dependencies
- Mock Cloudflare D1 database calls
- Mock external API calls (fetch, etc.)
- Mock authentication services
- Use `vi.mock()` for module-level mocking

```typescript
import { vi } from 'vitest';

vi.mock('../db/queries', () => ({
  getUserById: vi.fn(),
}));

describe('userHandler', () => {
  it('should handle database errors gracefully', async () => {
    const { getUserById } = await import('../db/queries');
    vi.mocked(getUserById).mockRejectedValueOnce(new Error('DB Error'));

    const result = await getUser('123');
    expect(result).toEqual({ error: 'Database error' });
  });
});
```

### Cloudflare Workers Testing
- Mock the request/response context
- Test middleware execution order
- Mock environment variables via `env` parameter

```typescript
describe('authMiddleware', () => {
  it('should authenticate valid tokens', async () => {
    const request = new Request('http://localhost/', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    const result = await authMiddleware(request);
    expect(result.user).toBeDefined();
  });
});
```

## Error Handling Testing

### Requirements
- Test all error paths
- Verify error messages are descriptive
- Ensure errors don't leak sensitive information
- Test error recovery mechanisms

```typescript
describe('apiHandler', () => {
  it('should handle validation errors', async () => {
    const response = await handler({ body: {} });
    expect(response.status).toBe(400);
    expect(response.body).toContain('validation error');
  });

  it('should not expose internal errors to client', async () => {
    vi.mocked(db.query).mockRejectedValueOnce(
      new Error('Internal DB secret key exposed')
    );

    const response = await handler(validRequest);
    expect(response.body).not.toContain('secret key');
  });
});
```

## Security Testing

### Required Tests
- SQL injection prevention (parameterized queries)
- XSS prevention (output escaping)
- CSRF token validation
- Authentication/authorization boundaries
- Rate limiting functionality
- Input validation and sanitization

```typescript
describe('Security', () => {
  it('should prevent SQL injection via parameterized queries', () => {
    const maliciousInput = "'; DROP TABLE users; --";
    const query = buildQuery('SELECT * FROM users WHERE name = ?', [maliciousInput]);
    expect(query).not.toContain('DROP TABLE');
  });

  it('should validate authorization before returning data', async () => {
    const response = await getUserData('other-user-id', 'my-token');
    expect(response.status).toBe(403);
  });
});
```

## Performance Testing

### Requirements
- Test response time for critical paths (< 100ms target)
- Monitor database query performance
- Test with realistic data volumes
- Identify and document performance bottlenecks

```typescript
describe('Performance', () => {
  it('should fetch user within 100ms', async () => {
    const start = performance.now();
    await getUserById('123');
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
  });
});
```

## Test Review Checklist

Before submitting a PR, ensure:

- [ ] All new code has corresponding tests
- [ ] All modified code has updated tests
- [ ] Coverage thresholds are met
- [ ] All tests pass locally
- [ ] Tests are deterministic (no flakiness)
- [ ] Mocks are properly isolated
- [ ] Error cases are tested
- [ ] Security-sensitive code has security tests
- [ ] Database operations use parameterized queries
- [ ] No sensitive data in test files (passwords, tokens)

## Continuous Integration Testing

### CI Pipeline Requirements
- Run full test suite on every commit
- Generate coverage reports
- Fail build if coverage drops below thresholds
- Run security linting
- Run type checking (TypeScript)

### GitHub Actions Workflow
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test -- --coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Test Execution Requirements

### Pre-Commit
- Run tests: `npm test`
- Check coverage: Coverage must not decrease

### Pre-Push
- All tests must pass
- Coverage report must show all thresholds met

### Before Code Review
- Coverage report generated and reviewed
- All critical paths have 100% coverage
- Security tests included and passing
- `npm run test` and `npm run test:e2e` both pass

## Maintenance & Documentation

### Test Documentation
- Document complex test setup in comments
- Explain why specific mocks are needed
- Document test data and fixtures used

```typescript
// Test data represents a user with both active and inactive sessions
// Used to verify session cleanup logic
const testUser = { /* ... */ };
```

### Updating Tests
- Update tests when requirements change
- Remove obsolete tests
- Keep test code as clean as production code
- Refactor duplicated test logic into helpers

## Performance Targets

| Component | Target | Measurement |
|-----------|--------|-------------|
| Unit test suite | < 5s | Total execution time |
| Integration tests | < 10s | Total execution time |
| Coverage report | < 2s | Generation time |
| Single test | < 500ms | Individual test duration |

## Waivers & Exceptions

### Coverage Exceptions
- Exceptions may only be granted by tech lead
- Document reason in code comment with justification
- Exception must not apply to critical paths (auth, DB, security)
- Exceptions must be reviewed in PR

Example:
```typescript
// @coverage-ignore - Error boundary for Cloudflare Workers platform-specific behavior
// that cannot be reliably tested in jsdom environment
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- Development Policy (for coding standards)
