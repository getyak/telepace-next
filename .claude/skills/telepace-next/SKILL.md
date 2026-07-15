```markdown
# telepace-next Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill introduces the core development patterns and conventions used in the `telepace-next` TypeScript codebase. It covers file naming, import/export styles, commit message habits, and testing patterns. By following these guidelines, contributors can maintain consistency and quality across the project.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `userProfile.ts`, `messageHandler.ts`

### Import Style
- Use **relative imports** for referencing modules.
  - Example:
    ```typescript
    import { getUser } from './userService';
    ```

### Export Style
- Use **named exports** for all modules.
  - Example:
    ```typescript
    // userService.ts
    export function getUser(id: string) { ... }
    export function createUser(data: User) { ... }

    // Importing
    import { getUser, createUser } from './userService';
    ```

### Commit Messages
- Commit messages are **freeform** (no enforced prefix), typically concise (~37 characters).
  - Example:  
    ```
    Add user authentication logic
    Fix bug in message handler
    ```

## Workflows

### Adding a New Module
**Trigger:** When you need to add a new feature or utility.
**Command:** `/add-module`

1. Create a new `.ts` file using camelCase naming.
2. Implement your logic using named exports.
3. Use relative imports to integrate with existing modules.
4. Write corresponding test files as `*.test.ts`.
5. Commit with a clear, concise message.

### Writing Tests
**Trigger:** When you add or modify functionality.
**Command:** `/write-test`

1. Create a test file named `moduleName.test.ts` in the same directory or a `__tests__` folder.
2. Use the project's preferred (unknown) testing framework.
3. Write tests covering all exported functions.
4. Run tests to ensure correctness.

### Refactoring Code
**Trigger:** When improving or restructuring existing code.
**Command:** `/refactor`

1. Rename files using camelCase if necessary.
2. Update imports to remain relative.
3. Ensure all exports are named.
4. Update or add tests to reflect changes.
5. Commit with a descriptive message.

## Testing Patterns

- Test files follow the `*.test.*` naming pattern (e.g., `userService.test.ts`).
- The specific testing framework is not detected; follow existing patterns in the codebase.
- Place tests close to the modules they cover or in a dedicated test directory.

**Example:**
```typescript
// userService.test.ts
import { getUser } from './userService';

test('getUser returns correct user', () => {
  // test implementation
});
```

## Commands
| Command        | Purpose                                   |
|----------------|-------------------------------------------|
| /add-module    | Scaffold and integrate a new module       |
| /write-test    | Create and run tests for a module         |
| /refactor      | Refactor code while following conventions |
```
