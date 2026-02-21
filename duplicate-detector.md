# Duplicate Function Detector

Semantic duplicate detection for TypeScript/Vue.js/Node.js microservice codebases. Standard copy-paste tools (jscpd) miss these because the code isn't textually similar — it's semantically similar. Different names, different implementations, same logic.

## How It Works

### Pass 1: Extract Metadata (local, fast)

Scan all `.ts`, `.vue`, and `.js` files across all services. For every function, extract:

- Function name
- JSDoc comment/description (if present, flag as "undocumented" if not)
- File path
- Service name (top-level directory)
- Function type (exported/internal, declaration/arrow/method)

Includes:
- `function` declarations (exported and named internal)
- Arrow functions assigned to exported `const` (e.g., `export const formatDate = (d: Date) => ...`)
- Class methods
- Functions inside Vue `<script>` and `<script setup>` blocks

Ignores: `node_modules`, `dist`, `.git`, `coverage`, `__tests__`, `*.test.*`, `*.spec.*`

**Threshold for internal functions:** Include all named functions with 3+ statements. This filters out trivial one-liners while catching anything substantial enough to be a real duplicate.

**Output:** Saves to `duplicate-report/pass1-metadata.json` so Pass 2 can be rerun without re-scanning.

### Pass 2: LLM Review of Metadata (cheap, fast)

Send the metadata list to OpenAI (`gpt-4o`). Prompt:

> Here is a list of functions across multiple microservices, with their names and descriptions. Identify pairs or groups that sound like they might do the same thing or very similar things, especially across different services. Return a JSON array of suspected duplicates with the function names, file paths, and a brief reason why you think they're duplicates.

If the function list exceeds ~800 functions, batch into chunks grouped by semantic domain (service pairs) to stay within context limits.

**Output:** Saves to `duplicate-report/pass2-suspects.json`.

### Pass 3: Code Comparison (targeted, only on suspects)

For each suspected duplicate pair from Pass 2, extract the actual function bodies from source. Send each pair to OpenAI. Prompt:

> Here are two functions from different services. Compare them. Are they functionally doing the same thing? If yes, describe what they do and suggest how to consolidate them into a shared utility. Return a JSON object with: verdict (duplicate / similar / different), explanation, and suggested shared function signature.

**Output:** Saves to `duplicate-report/pass3-comparisons.json`.

### Final Report

Generates `duplicate-report/report.md`:

- Confirmed duplicates with file locations and consolidation suggestions
- Similar functions worth reviewing
- Undocumented functions list (useful on its own)
- Summary stats (total functions scanned, suspects identified, confirmed duplicates)

## Technical Details

- **Language:** TypeScript (run with `npx ts-node` or `npx tsx`)
- **AST parsing:** `ts-morph` for `.ts`/`.js` files
- **Vue parsing:** `@vue/compiler-sfc` to extract `<script>`/`<script setup>` blocks, then feed to ts-morph
- **LLM:** OpenAI `gpt-4o` via `openai` npm package
- **Auth:** Expects `OPENAI_API_KEY` in environment

## CLI

```bash
# Full run from project root
detect-duplicates ./services

# Reuse Pass 1 metadata, only rerun LLM passes
detect-duplicates ./services --reuse-metadata

# Reuse Pass 1 and Pass 2, only rerun comparisons
detect-duplicates ./services --reuse-suspects

# Only scan specific services
detect-duplicates ./services --service api --service worker
```

## Options

| Flag | Description |
|---|---|
| `--reuse-metadata` | Skip Pass 1, reuse saved `pass1-metadata.json` |
| `--reuse-suspects` | Skip Pass 1 and 2, reuse saved `pass2-suspects.json` |
| `--service <name>` | Only scan/compare specific services (repeatable) |
| `--output <dir>` | Output directory (default: `duplicate-report/`) |
| `--dry-run` | Run Pass 1 only, show stats, no API calls |

## Dependencies

```json
{
  "ts-morph": "^22.0.0",
  "@vue/compiler-sfc": "^3.4.0",
  "openai": "^4.0.0"
}
```

## Notes

- This is a periodic audit tool, not a CI gate. Run it weekly or before major refactors.
- Works best when functions have JSDoc comments (enforced via `eslint-plugin-jsdoc`). Undocumented functions are still scanned but are harder for Pass 2 to triage by metadata alone.
- All intermediate outputs are saved as JSON so any pass can be inspected or rerun independently.
- The `duplicate-report/` directory should be gitignored.
