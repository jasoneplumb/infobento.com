# Setup

Get InfoBento running locally in under 5 minutes.

## Prerequisites

- Node.js 20+
- npm 10+
- Git

## Steps

```bash
# 1. Clone
git clone https://github.com/jasoneplumber/infobento.com.git
cd infobento.com

# 2. Install
npm install

# 3. Verify
npm run build        # Compile all packages
npm test             # Run tests
npm run lint         # Check linting
npm run format:check # Check formatting
```

All four commands should pass with zero errors. If they do, you're ready to contribute.

## Package Overview

| Package               | What it does                                 |
| --------------------- | -------------------------------------------- |
| `@infobento/core`     | Types, bento box definitions, layout engine  |
| `@infobento/renderer` | 2-bit grayscale eInk frame buffer generation |
| `@infobento/api`      | Stateless pure-function cloud API            |
| `@infobento/web`      | Web configuration interface                  |

## Next Steps

- [Architecture](ARCHITECTURE.md) — understand the system design
- [Development](DEVELOPMENT.md) — learn the workflow
- [Contributing](../../CONTRIBUTING.md) — PR guidelines
