# Code Review

Automated code quality CLI for LLM-generated codebases. Runs [semgrep](https://semgrep.dev/) with bundled rules, deduplicates findings, applies per-project severity overrides, and formats output for LLM consumption.

## Install

```bash
# Prerequisites
brew install semgrep          # or: pip install semgrep

# Install code-review globally
npm install -g @trainerday/code-review
```

## Usage

```bash
code-review                          # Run in current directory
code-review /path/to/project         # Run on specific directory
code-review --strict                 # Bypass project config, show everything
code-review --min-severity WARNING   # Only WARNING and ERROR
code-review --rules security         # Only security rules
code-review --format json            # Raw semgrep JSON output
code-review --format plain           # Human-readable semgrep output
code-review --help                   # Full documentation and setup guide
```

## What It Checks

| Rule Set | What it catches | Severity |
|---|---|---|
| **Security** | Hardcoded JWTs, MongoDB URIs with credentials, private keys | ERROR |
| **Hardcoded Strings** | String literals in comparisons, `.includes()`, `.indexOf()`, function args | WARNING/INFO |
| **Code Quality** | Loose equality (`==`), empty catch blocks, `console.log`, TODO comments, `throw e.message` (loses stack trace), Sentry full tracing | WARNING/INFO |

## Two-Tier Philosophy

### Tier 1: Vibe Coder (`code-review`)

For non-developers who build with LLMs. Every finding is actionable without coding knowledge:

1. Run `code-review`
2. Read the plain-English findings
3. Tell Claude Code: "Fix these code-review findings"
4. Review the diff, test, done

### Tier 2: Developer (`code-review --dev`) *(planned)*

Deeper analysis requiring engineering judgment: semantic duplicate detection, architecture checks, test coverage gaps, dependency security audits. Run periodically or in CI.

## Per-Project Configuration

### Severity overrides (`.code-review.yaml`)

Existing projects with tech debt can override severity levels so findings don't drown out real issues. **New projects should NOT use this.**

```yaml
# .code-review.yaml — only for existing projects with known tech debt

# Only show ERROR and WARNING (skip INFO)
min-severity: WARNING

# Demote rules to INFO (then filtered by min-severity above)
demote:
  - no-hardcoded-string-strict-eq
  - no-hardcoded-string-includes
```

### Project-specific semgrep rules

Drop `.yaml` rule files in a `.semgrep/` directory in your project. They'll be loaded automatically alongside the global rules.

### `.semgrepignore`

```
node_modules/
dist/
build/
coverage/
*.min.js
*.bundle.js
```

## CLI Flags

| Flag | Description |
|---|---|
| `--rules <set>` | Rule set: `all`, `hardcoded`, `security`, `quality` (default: `all`) |
| `--format <fmt>` | Output: `llm`, `json`, `plain` (default: `llm`) |
| `--min-severity <lvl>` | Minimum severity: `ERROR`, `WARNING`, `INFO` |
| `--strict` | Ignore all project overrides, show everything |
| `--semgrep-auto` | Include semgrep's built-in auto rules |

## Piping to Claude Code

```bash
# Analyze and auto-fix
code-review --format json | claude -p "Fix these findings."

# Just the hardcoded strings
code-review --rules hardcoded --format json | claude -p "Extract all hardcoded strings into constants."
```

## Architecture

```
code-review/
├── package.json
├── bin/
│   └── code-review.js              ← CLI entry point
├── lib/
│   └── formatter.js                ← Dedup, config loading, severity overrides, formatting
├── rules/                          ← Bundled semgrep rules
│   ├── hardcoded-strings.yaml
│   ├── security-secrets.yaml
│   └── code-quality.yaml
├── scripts/
│   └── postinstall.js              ← Warns if semgrep not installed
├── eslint.md                       ← ESLint + JSDoc setup guide (give to Claude)
├── duplicate-detector.md           ← Duplicate detector spec (planned)
└── README.md
```

## Adding Rules

### Global vs. project-specific

- **Global** (`rules/`): Rules for any TypeScript/JavaScript project. Ship with the npm package.
- **Project** (`<project>/.semgrep/`): Domain-specific rules for a particular project.

### Semgrep rule structure

```yaml
rules:
  - id: my-rule-name
    pattern: $X === "..."
    message: "Human-readable description."
    severity: ERROR | WARNING | INFO
    languages: [typescript, javascript]
```

| Pattern | Matches |
|---|---|
| `"..."` | Any string literal |
| `$X` | Any single expression |
| `$FN(...)` | Any function call |
| `$X.$METHOD(...)` | Any method call |
| `...` (in code) | Any code (zero or more statements) |

## JSDoc Enforcement

`code-review` does not check for JSDoc — use ESLint with [`eslint-plugin-jsdoc`](https://www.npmjs.com/package/eslint-plugin-jsdoc) for that. See [`eslint.md`](eslint.md) for a complete setup guide you can give directly to Claude Code.

The recommended config only requires a one-line description on exported functions — no `@param` or `@returns` tags needed:

```typescript
/** Calculate training plan blocks from profile and activity data */
export const getBlocks = (profileFacts, activityFacts) => {
```

## Design Philosophy

### The core problem with LLM-generated code

LLMs write big monolithic functions with branching logic baked in. Nobody tests the branches. The code works until it doesn't, and debugging is impossible because the functions do too much.

### The rule: isolate your conditionals

Every `if` branch with meaningful logic should call a named function. The parent becomes a simple orchestrator. This makes every code path unit-testable.

**Bad** (untestable monolith):
```typescript
function processOrder(order) {
  if (order.type === "subscription") {
    // 30 lines of subscription logic
  } else if (order.type === "one-time") {
    // 25 lines of one-time logic
  } else {
    // 20 lines of default logic
  }
}
```

**Good** (each path is testable):
```typescript
function processOrder(order) {
  if (order.type === "subscription") return processSubscription(order)
  if (order.type === "one-time") return processOneTime(order)
  return processDefault(order)
}
```

## Roadmap

### Tier 1
- [x] Semgrep static analysis with bundled rules
- [x] Output formatting for LLM consumption
- [x] `code-review` global CLI command (npm package)
- [x] Per-project severity overrides (`.code-review.yaml`, `--min-severity`, `--strict`)
- [ ] Function length rule (>50 lines error, >30 warning)
- [ ] If/else block length rule (>10 lines = extract to function)
- [ ] File length rule (>300 lines error, >200 warning)
- [ ] ESLint shared config with JSDoc enforcement
- [ ] Per-project setup automation (`code-review init`)
- [ ] Outdated dependency warnings

### Tier 2
- [ ] `code-review --dev` mode
- [ ] Semantic duplicate function detector (see `duplicate-detector.md`)
- [ ] Cross-service analysis
- [ ] Baseline/diff mode (only findings on changed files)
- [ ] CI integration (GitHub Actions)
- [ ] Dependency security audit (CVEs)

## Dependencies

- [semgrep](https://semgrep.dev/) — `brew install semgrep` or `pip install semgrep`
- Node.js 18+
- [js-yaml](https://www.npmjs.com/package/js-yaml) (bundled)
