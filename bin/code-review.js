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

function usage() {
  console.error(`Usage: code-review [target-dir] [options]

Options:
  --rules <set>          Rule set: all, hardcoded, security, quality (default: all)
  --format <fmt>         Output format: llm, json, plain (default: llm)
  --min-severity <lvl>   Minimum severity: ERROR, WARNING, INFO
  --strict               Bypass project config overrides
  --semgrep-auto         Include semgrep built-in auto rules`);
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
