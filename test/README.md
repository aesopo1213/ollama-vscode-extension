# Test Suite for Ollama VSCode Extension

This directory contains comprehensive tests for the Ollama VSCode extension, following VSCode extension testing best practices.

## Test Structure

```
test/
├── README.md                 # This file
├── tsconfig.json            # TypeScript configuration for tests
├── runTest.ts               # Main test runner
├── fixtures/                # Test data and fixtures
│   └── testData.ts          # Mock data for tests
├── mocks/                   # Mock implementations
│   └── vscode.ts            # VSCode API mocks
└── suite/                   # Test suites
    ├── index.ts             # Test suite entry point
    ├── extension.test.ts    # Extension integration tests
    ├── services/            # Service layer tests
    │   ├── logger.test.ts
    │   ├── ollamaService.test.ts
    │   └── mcpServerService.test.ts
    ├── provider/            # Provider tests
    │   ├── chatHistoryProvider.test.ts
    │   └── modelTreeDataProvider.test.ts
    └── utils/               # Utility function tests
        └── security.test.ts
```

## Running Tests

### Prerequisites

Make sure you have installed all dependencies:

```bash
npm install
```

### Available Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Compile tests only
npm run compile-tests
```

### Running Individual Test Files

```bash
# Compile tests first
npm run compile-tests

# Run specific test file
node ./out/test/runTest.js --grep "Logger Service Tests"
```

## Test Categories

### 1. Unit Tests

Unit tests focus on testing individual functions and classes in isolation:

- **Logger Service**: Tests logging functionality, production mode behavior, and message formatting
- **Ollama Service**: Tests API interactions, model management, and error handling
- **MCP Server Service**: Tests server management, tool discovery, and request handling
- **Security Utils**: Tests UUID and nonce generation
- **Providers**: Tests tree data providers and their data handling

### 2. Integration Tests

Integration tests verify that different components work together correctly:

- **Extension Tests**: Tests extension activation, command registration, and tree view creation
- **Service Integration**: Tests how services interact with each other
- **Provider Integration**: Tests how providers interact with VSCode APIs

## Test Utilities

### Mock System

The test suite includes comprehensive mocks for:

- **VSCode API**: All VSCode APIs are mocked to avoid dependency on the actual VSCode environment
- **Axios**: HTTP requests are mocked for predictable testing
- **Child Process**: External process execution is mocked

### Test Fixtures

Common test data is provided in `fixtures/testData.ts`:

- Mock Ollama models
- Mock chat messages and sessions
- Mock MCP servers
- Mock API responses

### Mock Utilities

The `mocks/vscode.ts` file provides:

- Complete VSCode API mocks
- Reset functionality for clean test runs
- Stub implementations for all major VSCode interfaces

## Writing New Tests

### Test File Structure

```typescript
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { YourClass } from '../../../src/your/class';
import { mockVSCode, resetMocks } from '../../mocks/vscode';

// Mock VSCode
const vscodeMock = vscode as any;
Object.assign(vscodeMock, mockVSCode);

suite('Your Class Tests', () => {
  let instance: YourClass;
  let mockContext: any;

  setup(() => {
    resetMocks();
    // Set up test data
  });

  teardown(() => {
    sinon.restore();
  });

  test('should do something', () => {
    // Test implementation
    assert.strictEqual(actual, expected);
  });
});
```

### Best Practices

1. **Use setup/teardown**: Always reset mocks and clean up after tests
2. **Mock external dependencies**: Don't make real API calls or file system operations
3. **Test error cases**: Include tests for error conditions and edge cases
4. **Use descriptive test names**: Test names should clearly describe what is being tested
5. **Group related tests**: Use `suite()` to group related tests together
6. **Assert specific conditions**: Use specific assertions rather than generic ones

### Mock Usage Examples

```typescript
// Mock VSCode API calls
mockVSCode.window.showInformationMessage.returns(Promise.resolve('OK'));

// Mock axios responses
mockAxios.get.resolves({ data: { models: [] } });

// Mock configuration
mockVSCode.workspace.getConfiguration.returns({
  get: sinon.stub().returns('localhost')
});

// Verify calls
assert(mockVSCode.window.showInformationMessage.calledWith('Expected message'));
```

## Test Coverage

The test suite aims to achieve:

- **Unit Test Coverage**: >90% for all service classes
- **Integration Test Coverage**: All major user workflows
- **Error Handling Coverage**: All error conditions and edge cases

## Debugging Tests

### Running Tests in Debug Mode

1. Set breakpoints in your test files
2. Use the VSCode debugger with the "Run Tests" configuration
3. Or run tests with Node.js debugger:

```bash
node --inspect-brk ./out/test/runTest.js
```

### Common Issues

1. **Mock not working**: Ensure you're calling `resetMocks()` in setup
2. **Async test failures**: Make sure to await async operations
3. **Import errors**: Check that test files are in the correct directory structure

## Continuous Integration

Tests are designed to run in CI environments:

- No external dependencies (all APIs are mocked)
- Deterministic results (no random data)
- Fast execution (no real I/O operations)
- Clear error reporting

## Contributing

When adding new features:

1. Write tests first (TDD approach)
2. Ensure all tests pass
3. Add tests for error conditions
4. Update this documentation if needed
5. Run the full test suite before submitting PRs
