# ESLint Setup

Instructions for setting up ESLint with JSDoc enforcement in a TypeScript/JavaScript project. Give this document to Claude Code and ask it to set up ESLint.

## Setup

```bash
npm install --save-dev eslint eslint-plugin-jsdoc @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

## Config

Create `eslint.config.mjs` (flat config):

```js
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import jsdocPlugin from "eslint-plugin-jsdoc";

export default [
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      jsdoc: jsdocPlugin,
    },
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      // Require JSDoc on all exported functions
      "jsdoc/require-jsdoc": ["warn", {
        require: {
          FunctionDeclaration: true,
          MethodDefinition: true,
          ClassDeclaration: true,
          ArrowFunctionExpression: true,
        },
        publicOnly: true,
      }],
      "jsdoc/require-description": "warn",
    },
  },
  {
    // Skip test files and config files
    ignores: [
      "**/*.test.*",
      "**/*.spec.*",
      "**/__tests__/**",
      "dist/**",
      "build/**",
      "node_modules/**",
      "coverage/**",
    ],
  },
];
```

## Add script to package.json

```bash
npm pkg set scripts.lint="eslint ."
npm pkg set scripts.lint:fix="eslint . --fix"
```

## Add to CLAUDE.md

```
## ESLint
Run `npm run lint` before committing. Add JSDoc to every new exported function.
```

## One-time bulk JSDoc addition

For existing projects, ask Claude:

> Go through every file and add JSDoc comments to every exported function. Keep descriptions short — one sentence explaining what the function does.
