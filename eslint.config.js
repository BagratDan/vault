import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import noNetworkImports from "./tools/eslint-rules/no-network-imports-outside-net.js";

export default [
  // Global ignores
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/.vault/**",
      "**/.data/**",
    ],
  },
  // Global rules for all TypeScript files under packages/, tools/, e2e/
  {
    files: [
      "packages/**/*.{ts,tsx}",
      "tools/**/*.{ts,tsx}",
      "e2e/**/*.{ts,tsx}",
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    plugins: {
      "@typescript-eslint": typescriptEslint,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // Network import guard — applies to TS/TSX/JS/MJS/CJS across packages/ and e2e/
  // (e2e/ runs in Node and could regress the trust posture if it pulled in
  // unauthorized network deps).
  {
    files: [
      "packages/**/*.{ts,tsx,js,mjs,cjs}",
      "e2e/**/*.{ts,tsx,js,mjs,cjs}",
    ],
    plugins: {
      "vault-internal": {
        rules: { "no-network-imports-outside-net": noNetworkImports },
      },
    },
    rules: {
      "vault-internal/no-network-imports-outside-net": "error",
    },
  },
];
