# Contributing to InfoBento

## Prerequisites

- **Node.js:** Version 20+ ([download](https://nodejs.org/))
- **npm:** Comes with Node.js (10+)
- **Git:** For version control

## First Time Setup

```bash
git clone https://github.com/jasoneplumber/infobento.com.git
cd infobento.com
npm install

# Verify setup
npm run build        # Should compile all packages
npm test             # Should pass
npm run lint         # Should pass
npm run format:check # Should pass
```

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout mainline
git pull origin mainline
git checkout -b feature/your-feature-name
```

**Branch naming:**

- `feature/` — New features
- `fix/` — Bug fixes
- `refactor/` — Code restructuring
- `docs/` — Documentation updates
- `test/` — Test additions

### 2. Make Your Changes

**Before coding:**

1. Read [docs/getting-started/ARCHITECTURE.md](docs/getting-started/ARCHITECTURE.md)
2. Read [docs/reference/INTENT_TEMPLATES.md](docs/reference/INTENT_TEMPLATES.md) for documentation standards
3. Check module intent headers in relevant files

**While coding:**

- Follow existing patterns and code style
- Add intent headers to new files (Intent, Context, Pattern, Future)
- Document non-obvious decisions with `// tradeoff:` or `// constraint:` comments
- Write tests alongside source code

### 3. Run Quality Checks

```bash
npm run build        # TypeScript compilation
npm test             # Unit tests
npm run lint         # ESLint
npm run format:check # Prettier
```

### 4. Commit Your Changes

Git hooks enforce quality and consistency automatically.

```bash
git add .
git commit -m "feat(core): add weather box type definition"
```

#### Commit Message Format (Enforced)

Use **conventional commit** format: `<type>(<scope>): <description>`

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `revert`

**Examples:**

- `feat(renderer): add bitmap font rendering`
- `fix(api): handle empty bento config gracefully`
- `docs(hardware): update BLE protocol spec`
- `test(core): add layout calculator edge cases`

#### Git Hooks

**Pre-commit** (~3s):

- Secret detection (blocks `.env`, `.key`, etc.)
- Debug statement check (blocks `debugger`)
- Version sync (all `package.json` versions must match)
- Type check + lint-staged

**Commit-msg** (~0.1s):

- Enforces conventional commit pattern
- Minimum 10 characters
- Auto-adds `Co-Authored-By`

**Pre-push** (~30s):

- Unit tests
- Build validation

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

**PR Checklist:**

- [ ] All CI checks pass (build, test, lint, format)
- [ ] Tests added for new features
- [ ] Documentation updated if needed
- [ ] Intent headers on new files
- [ ] PR description explains the change
- [ ] PR is focused on a single feature or fix

### 6. Request a Claude Review

Add the `review-requested` label to trigger the automated Claude review — as a
separate step _after_ creating the PR (folding it into `gh pr create` suppresses
the `labeled` event the workflow listens for):

```bash
gh pr edit <N> --add-label review-requested
```

The reviewer posts inline comments on specific lines plus a summary comment
starting with `🔍 Review verdict: N findings` — the summary appears even when
there are zero findings. A review run that posts _nothing_ fails its check by
design (the tripwire added for #185): silence means the reviewer broke, not
that the code is clean. Re-trigger a review by removing and re-adding the
label.

Note: PRs that modify `.github/workflows/claude-review.yml` itself are
admin-merged once `ci` is green — a modified review workflow shouldn't
self-certify, and in practice these PRs' review checks come out skipped
rather than passing.
