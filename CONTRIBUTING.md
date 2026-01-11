# Contributing to Voyager

Thank you for your interest in contributing to Voyager! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Supabase account (or local Supabase CLI)
- API keys: Anthropic, OpenAI, Google

### Development Setup

```bash
# Clone the repository
git clone https://github.com/isaacasamoah/voyager-shell.git
cd voyager-shell

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your API keys
# See Environment Variables section in README.md

# Apply database migrations
npx supabase db push

# Start development server
npm run dev
```

### Verify Setup

```bash
npm run type-check  # TypeScript
npm run lint        # ESLint
npm run test        # Vitest
npm run build       # Production build
```

---

## Development Workflow

### Branch Strategy

```
main              # Stable, deployable
├── feature/*     # New features
├── fix/*         # Bug fixes
└── refactor/*    # Code improvements
```

### Pull Request Process

1. **Create a branch** from `main`
2. **Make your changes** with clear, atomic commits
3. **Run quality checks** (`npm run type-check && npm run lint && npm run test`)
4. **Open a PR** with a clear description
5. **Wait for review** - all PRs require review before merging

### Commit Messages

Follow conventional commits:

```
feat: Add keyword_grep retrieval tool
fix: Resolve session resume race condition
refactor: Extract prompt composition to lib/prompts
docs: Update README with architecture diagram
test: Add integration tests for chat API
```

---

## Code Standards

### TypeScript

- **Strict mode enabled** - No `any` types without justification
- **Named exports only** - No default exports
- **Explicit return types** for public functions
- **Interface Props** above components

```typescript
// Good
export const MyComponent = (props: MyComponentProps): JSX.Element => { ... }

// Bad
export default function MyComponent(props) { ... }
```

### React Components

- **Arrow functions** for all components
- **Props interface** defined above component
- **Files under 250 lines** (split if larger)

```typescript
interface UserMessageProps {
  content: string;
  timestamp: Date;
}

export const UserMessage = ({ content, timestamp }: UserMessageProps) => {
  return (
    <div className="...">
      {content}
    </div>
  );
};
```

### File Organization

```
lib/
  feature/
    index.ts         # Public exports
    types.ts         # Type definitions
    utils.ts         # Helper functions
    feature.test.ts  # Tests co-located
```

### Error Handling

```typescript
// Pattern: Log with context prefix, fallback gracefully
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  console.error('[FeatureName] Operation failed:', error);
  return fallbackValue;
}
```

---

## Key Areas for Contribution

### 1. Knowledge System (`lib/knowledge/`)

The heart of Voyager. Contributions welcome in:
- Graph algorithms (better `get_connected` traversal)
- Search optimization (query strategies)
- Event processing (classification, entity extraction)

### 2. Retrieval Tools (`lib/retrieval/`)

Claude's toolbox. Ideas:
- New retrieval strategies
- Better threshold tuning
- Multi-step retrieval chains

### 3. Integrations

Connectors for external tools (all future work):
- Slack (highest priority)
- Jira
- Google Drive
- GitHub

### 4. UI/UX (`components/`)

Terminal aesthetic improvements:
- Accessibility (keyboard navigation, screen readers)
- Animation polish
- Mobile responsiveness

### 5. Testing

Coverage improvements:
- Integration tests for API routes
- Unit tests for services
- E2E tests with Playwright

---

## Architecture Guidelines

### Adding a New API Route

```typescript
// app/api/feature/route.ts
import { getAuthenticatedUserId } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export const POST = async (req: NextRequest) => {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await req.json();
    // ... implementation

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Feature] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
};
```

### Adding a New Retrieval Tool

```typescript
// In lib/retrieval/tools.ts
const myNewTool = tool({
  description: 'What this tool does and when to use it',
  parameters: z.object({
    param: z.string().describe('Parameter description'),
  }),
  execute: async ({ param }) => {
    // Implementation
    return results;
  },
});
```

### Adding a Knowledge Event Type

1. Update migration in `supabase/migrations/`
2. Add type to `lib/knowledge/types.ts`
3. Add creation function to `lib/knowledge/events.ts`
4. Update `knowledge_current` trigger if needed

---

## Testing

### Running Tests

```bash
npm run test              # Watch mode
npm run test:run          # Single run
npm run test:coverage     # With coverage
npm run test:ui           # Vitest UI
```

### Writing Tests

```typescript
// feature.test.ts
import { describe, it, expect } from 'vitest';
import { myFunction } from './index';

describe('myFunction', () => {
  it('should handle normal case', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  it('should handle edge case', () => {
    const result = myFunction('');
    expect(result).toBe('fallback');
  });
});
```

---

## Questions?

- **Architecture decisions**: Check `.claude/research/voyager-v2/foundation.md`
- **Roadmap**: See `.claude/research/voyager-v2/slices.md`
- **Implementation details**: Read the code - it's documented

For questions not covered here, open a GitHub issue or discussion.

---

*Welcome aboard. Let's build something beautiful.*
