#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');

try {
  execFileSync('which', ['semgrep'], { stdio: 'ignore' });
} catch {
  console.warn(
    '\n' +
    '⚠  code-review requires semgrep but it was not found on your PATH.\n' +
    '\n' +
    '  Install it:\n' +
    '    macOS:   brew install semgrep\n' +
    '    pip:     pip install semgrep\n' +
    '    other:   https://semgrep.dev/docs/getting-started/\n'
  );
}
