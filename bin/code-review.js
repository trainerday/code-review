#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { formatResults } = require('../lib/formatter');

const RULES_DIR = path.join(__dirname, '..', 'rules');

const RULE_SETS = {
  all: null, // special case — all .yaml files
  hardcoded: 'hardcoded-strings.yaml',
  security: 'security-secrets.yaml',
  quality: 'code-quality.yaml',
};

function showHelp() {
  console.log(`code-review — Automated code quality for LLM-generated codebases

USAGE
  code-review [target-dir] [options]

  Run from any project directory. If no target is given, uses the current directory.

OPTIONS
  --rules <set>          Rule set: all, hardcoded, security, quality (default: all)
  --format <fmt>         Output format: llm, json, plain (default: llm)
  --min-severity <lvl>   Minimum severity: ERROR, WARNING, INFO
  --strict               Bypass project config, show all findings
  --semgrep-auto         Include semgrep's built-in auto rules
  --help                 Show this help

EXAMPLES
  code-review                          Run all rules in current directory
  code-review /path/to/project         Run on a specific project
  code-review --rules security         Only security rules
  code-review --strict                 Ignore project config, show everything
  code-review --min-severity WARNING   Skip INFO findings
  code-review --format json            Raw semgrep JSON (for piping)

PIPING TO AN LLM
  code-review --format json | claude -p "Fix these findings."
  code-review --rules hardcoded --format json | claude -p "Extract these into constants."

PROJECT CONFIGURATION (.code-review.yaml)
  Drop a .code-review.yaml in your project root to customize how findings are
  reported. This is for existing projects with known tech debt — new projects
  should enforce all rules at default severity from day one.

  Example .code-review.yaml:

    # Only show ERROR and WARNING (skip INFO-level noise)
    min-severity: WARNING

    # Demote specific rules to INFO (then filtered out by min-severity above).
    # Use this for known tech debt you plan to fix later.
    demote:
      - no-hardcoded-string-strict-eq
      - no-hardcoded-string-includes
      - for-in-array

  To see what a rule ID is, run code-review --strict and look at the [rule-id]
  in brackets after each finding.

  To see all findings ignoring the config: code-review --strict

PROJECT-SPECIFIC SEMGREP RULES
  Add .yaml rule files to a .semgrep/ directory in your project. They load
  automatically alongside the global rules. Use these for domain-specific
  patterns (e.g., "user roles must use the Roles enum").

SEMGREPIGNORE
  Create a .semgrepignore file in your project root to skip directories:

    node_modules/
    dist/
    build/
    coverage/
    *.min.js

USING WITH CLAUDE CODE
  Add this to your project's CLAUDE.md or instructions:

    ## Code Review
    Before finishing any task, run \`code-review\` and fix all ERROR and WARNING
    findings. Use \`code-review --strict\` to see the full unfiltered list.
    Do not add new hardcoded strings — use constants or enums.

AVAILABLE RULES
  security    Hardcoded JWTs, MongoDB URIs, private keys, jwt-decode without
              verify, cors() with no origin config
  hardcoded   String literals in comparisons, .includes(), .indexOf(), function args
  quality     Loose equality (==), empty catch blocks, console.log, TODO comments,
              for...in on arrays, throw e.message, Sentry full tracing

PREREQUISITES
  semgrep must be installed: brew install semgrep (or pip install semgrep)`);
  process.exit(0);
}

function usage() {
  console.error(`Usage: code-review [target-dir] [options]
Try 'code-review --help' for full documentation.`);
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
let target = '.';
let rules = 'all';
let format = 'llm';
let minSeverity = '';
let strict = false;
let includeAuto = false;

// Check for --help anywhere in args
if (args.includes('--help') || args.includes('-h')) {
  showHelp();
}

// First positional arg is target (if it doesn't start with --)
if (args.length > 0 && !args[0].startsWith('--')) {
  target = args.shift();
}

while (args.length > 0) {
  const arg = args.shift();
  switch (arg) {
    case '--rules':
      rules = args.shift() || '';
      break;
    case '--format':
      format = args.shift() || '';
      break;
    case '--min-severity':
      minSeverity = args.shift() || '';
      break;
    case '--strict':
      strict = true;
      break;
    case '--semgrep-auto':
      includeAuto = true;
      break;
    default:
      console.error(`Unknown option: ${arg}`);
      usage();
  }
}

// Resolve target to absolute path
target = path.resolve(target);
if (!fs.existsSync(target)) {
  console.error(`Error: target directory does not exist: ${target}`);
  process.exit(1);
}

// Check for semgrep
try {
  execFileSync('which', ['semgrep'], { stdio: 'ignore' });
} catch {
  console.error('Error: semgrep is not installed. Run: brew install semgrep');
  process.exit(1);
}

// Build config args
const configArgs = [];

if (!(rules in RULE_SETS)) {
  console.error(`Unknown rule set: ${rules} (use: all, hardcoded, security, quality)`);
  process.exit(1);
}

if (rules === 'all') {
  const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.yaml'));
  for (const f of files) {
    configArgs.push('--config', path.join(RULES_DIR, f));
  }
} else {
  configArgs.push('--config', path.join(RULES_DIR, RULE_SETS[rules]));
}

// Project-specific rules
const projectRulesDir = path.join(target, '.semgrep');
if (fs.existsSync(projectRulesDir)) {
  const files = fs.readdirSync(projectRulesDir).filter(f => f.endsWith('.yaml'));
  for (const f of files) {
    configArgs.push('--config', path.join(projectRulesDir, f));
  }
  console.log(`Loaded project rules from ${projectRulesDir}`);
}

if (includeAuto) {
  configArgs.push('--config', 'auto');
}

console.log('=== Code Review ===');
console.log(`Target: ${target}`);
console.log(`Rules:  ${rules} (${configArgs.length / 2} configs loaded)`);
console.log('');

// Run semgrep
const semgrepArgs = ['scan', ...configArgs, '--json', target];
let semgrepOutput;
try {
  semgrepOutput = execFileSync('semgrep', semgrepArgs, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch (err) {
  // semgrep exits 1 when findings exist — that's expected
  if (err.stdout) {
    semgrepOutput = err.stdout;
  } else {
    console.error('Error running semgrep');
    process.exit(1);
  }
}

if (format === 'json') {
  process.stdout.write(semgrepOutput);
} else if (format === 'llm') {
  formatResults(semgrepOutput, { targetDir: target, minSeverity, strict });
} else if (format === 'plain') {
  // Re-run without --json for human-readable output
  const plainArgs = ['scan', ...configArgs, target];
  try {
    execFileSync('semgrep', plainArgs, { stdio: 'inherit' });
  } catch {
    // exit code 1 = findings, that's fine
  }
} else {
  console.error(`Unknown format: ${format} (use: llm, json, plain)`);
  process.exit(1);
}
