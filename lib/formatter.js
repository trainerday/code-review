'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SEVERITY_ORDER = { ERROR: 0, WARNING: 1, INFO: 2 };

function loadProjectConfig(targetDir) {
  const configPath = path.join(targetDir, '.code-review.yaml');
  if (!fs.existsSync(configPath)) return {};
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return yaml.load(content) || {};
  } catch (err) {
    console.error(`Warning: Could not read ${configPath}: ${err.message}`);
    return {};
  }
}

function applyOverrides(results, config, minSeverityFlag, strict) {
  if (!strict) {
    const demoteRules = new Set(config.demote || []);
    for (const r of results) {
      const ruleId = r.check_id.split('.').pop();
      if (demoteRules.has(ruleId)) {
        r.extra.severity = 'INFO';
        r.extra.demoted = true;
      }
    }
  }

  // Min severity: CLI flag always works, config only in non-strict mode
  const minSev = minSeverityFlag || (!strict ? config['min-severity'] : null);
  if (minSev) {
    const upper = minSev.toUpperCase();
    if (upper in SEVERITY_ORDER) {
      const threshold = SEVERITY_ORDER[upper];
      results = results.filter(r => {
        const sev = (r.extra && r.extra.severity) || 'INFO';
        return (SEVERITY_ORDER[sev] ?? 2) <= threshold;
      });
    }
  }

  return results;
}

function formatResults(jsonString, opts) {
  const { targetDir, minSeverity, strict } = opts;

  const data = JSON.parse(jsonString);
  let results = data.results || [];

  // Deduplicate (same file + line + rule)
  const seen = new Set();
  const unique = [];
  for (const r of results) {
    const key = `${r.path}:${r.start.line}:${r.check_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  // Load project config and apply overrides
  const config = targetDir ? loadProjectConfig(targetDir) : {};
  const filtered = applyOverrides(unique, config, minSeverity, strict);

  if (filtered.length === 0) {
    console.log('No findings. Code looks clean.');
    return;
  }

  // Read actual source lines and group by severity
  const fileCache = {};
  const bySeverity = { ERROR: [], WARNING: [], INFO: [] };

  for (const r of filtered) {
    const filePath = r.path;
    const lineNum = r.start.line;
    const rule = r.check_id.split('.').pop();
    const severity = (r.extra && r.extra.severity) || 'INFO';

    if (!(filePath in fileCache)) {
      try {
        fileCache[filePath] = fs.readFileSync(filePath, 'utf8').split('\n');
      } catch {
        fileCache[filePath] = [];
      }
    }

    const lines = fileCache[filePath];
    const code = lineNum <= lines.length ? lines[lineNum - 1].trim() : '???';

    if (!bySeverity[severity]) bySeverity[severity] = [];
    bySeverity[severity].push({ file: filePath, line: lineNum, rule, code });
  }

  const totalFiles = new Set(filtered.map(r => r.path)).size;
  console.log(`Found ${filtered.length} issues across ${totalFiles} files.`);

  // Show config status
  if (Object.keys(config).length > 0 && !strict) {
    const demoted = config.demote || [];
    const minSev = minSeverity || config['min-severity'];
    const notes = [];
    if (minSev) notes.push(`min-severity: ${minSev.toUpperCase()}`);
    if (demoted.length > 0) notes.push(`${demoted.length} rules demoted to INFO`);
    if (notes.length > 0) console.log(`Project config: ${notes.join(', ')}`);
  }
  console.log('');

  for (const severity of ['ERROR', 'WARNING', 'INFO']) {
    const findings = bySeverity[severity] || [];
    if (findings.length === 0) continue;
    console.log(`--- ${severity} (${findings.length}) ---`);
    for (const f of findings) {
      console.log(`  ${f.file}:${f.line}  [${f.rule}]`);
      console.log(`    ${f.code}`);
    }
    console.log('');
  }

  console.log('---');
  console.log('Pipe to Claude Code to analyze and fix:');
  console.log(
    "  code-review . --format json | claude -p " +
    "'Analyze these findings. Categorize as BUG, SHOULD_BE_CONSTANT, " +
    "NAMING_INCONSISTENCY, or SAFE_TO_IGNORE. Fix the bugs.'"
  );
}

module.exports = { formatResults };
