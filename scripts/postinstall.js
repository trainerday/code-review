#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');

let semgrepOk = false;
try {
  execFileSync('which', ['semgrep'], { stdio: 'ignore' });
  semgrepOk = true;
} catch {}

console.log(
  '\n' +
  '  code-review installed successfully.\n' +
  '\n' +
  '  Get started:\n' +
  '    code-review --help       Full documentation, configuration guide, and examples\n' +
  '    code-review              Run in current directory\n' +
  '    code-review --strict     Show all findings (bypass project config)\n' +
  '\n' +
  '  Add to your project\'s CLAUDE.md:\n' +
  '\n' +
  '    ## Code Review\n' +
  '    Run `code-review --help` for full docs. Run `code-review` before finishing\n' +
  '    any task and fix all ERROR and WARNING findings. Use constants/enums instead\n' +
  '    of hardcoded strings. Run `code-review --strict` to see unfiltered results.\n' +
  ''
);

if (!semgrepOk) {
  console.warn(
    '  ⚠  semgrep was not found on your PATH. code-review requires it.\n' +
    '\n' +
    '  Install it:\n' +
    '    macOS:   brew install semgrep\n' +
    '    pip:     pip install semgrep\n' +
    '    other:   https://semgrep.dev/docs/getting-started/\n'
  );
}
