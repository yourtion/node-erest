# Test Utilities Quick Reference

## 🚀 Quick Start

```typescript
import { createTestERestInstance } from "./utils/test-setup";
import { assertParamValidation, assertSchemaValidation } from "./utils/assertion-helpers";
import { createGetApi, commonParams } from "./utils/api-helpers";

// Basic test setup
const apiService = createTestERestInstance();
const api = apiService.api;
```

## 📝 Common Patterns

### Parameter Validation
```typescript
// Success case
assertParamValidation(paramsChecker, "name", "John", stringParam, "John");

// Error case
assertParamValidationError(paramsChecker, "name", null, stringParam, /required/);
```

### Schema Validation
```typescript
// Valid data
assertSchemaValidation(schemaChecker, validData, schema, expectedResult);

// Invalid data
assertSchemaValidationError(schemaChecker, invalidData, schema, /error pattern/);
```

### API Creation
```typescript
// Simple API
const api = createGetApi(apiService.api, "/users", "Get Users");

// API with parameters
const api = createPostApi(apiService.api, "/users", "Create User")
  .body({ name: commonParams.name, age: commonParams.age })
  .required(["name"]);
```

### Router Testing
```typescript
// Test router binding
const router = express.Router();
apiService.bindRouter(router, apiService.checkerExpress);

// Verify API registration
assertApiRegistered(api, "get", "/users", "GET_/users");
```

## 🛠️ Utility Functions

| Function | Purpose | Example |
|----------|---------|---------|
| `createTestERestInstance()` | Create test API service | `const api = createTestERestInstance()` |
| `assertParamValidation()` | Test parameter validation | `assertParamValidation(checker, "name", "John", param, "John")` |
| `assertSchemaValidation()` | Test schema validation | `assertSchemaValidation(checker, data, schema, result)` |
| `createGetApi()` | Create GET API | `createGetApi(api, "/users", "Get Users")` |
| `createMockHook()` | Create mock hook | `const hook = createMockHook("testHook")` |

## 📋 Common Parameters

```typescript
import { commonParams } from "./utils/api-helpers";

// Available parameters
commonParams.id        // String ID parameter
commonParams.name      // String name parameter  
commonParams.age       // Number age parameter
commonParams.email     // String email parameter
```

## 🎯 Test Structure

```typescript
describe("Component - Feature", () => {
  describe("Specific Functionality", () => {
    test("should handle specific case", () => {
      // Arrange
      const testData = /* setup */;
      
      // Act
      const result = /* execute */;
      
      // Assert
      assertSomething(result, expected);
    });
  });
});
```

## 🔧 Error Patterns

| Error Type | Pattern | Example |
|------------|---------|---------|
| Required parameter | `/missing required parameter/` | Missing required field |
| Type validation | `/should be valid (Type)/` | Invalid type conversion |
| Enum validation | `/should be valid ENUM/` | Invalid enum value |
| Schema validation | `/missing required parameter/` | Schema validation failure |

## 📦 Import Cheatsheet

```typescript
// Test setup
import { createTestERestInstance, setupExpressTest } from "./utils/test-setup";

// Assertions
import { 
  assertParamValidation, 
  assertSchemaValidation,
  assertApiRegistered 
} from "./utils/assertion-helpers";

// API helpers
import { 
  createGetApi, 
  createPostApi, 
  commonParams 
} from "./utils/api-helpers";

// Mocks
import { 
  createMockHook, 
  createStandardHooks 
} from "./utils/mock-factories";

// Fixtures
import { apiFixtures, schemaFixtures } from "./fixtures";
```

## ⚡ Performance Tips

1. **Reuse instances**: Create test instances once per describe block
2. **Use fixtures**: Avoid creating test data in each test
3. **Proper cleanup**: Clean up resources in afterEach hooks
4. **Shared utilities**: Use assertion helpers instead of manual expects

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| Import errors | Check relative paths to utils |
| Type errors | Use proper TypeScript types |
| Assertion failures | Verify error patterns match actual messages |
| Setup issues | Ensure proper test environment initialization |

---

For detailed documentation, see [README.md](./README.md)