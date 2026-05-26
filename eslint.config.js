import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import noNetworkImports from "./tools/eslint-rules/no-network-imports-outside-net.js";

export default [
  // Global rules for all TypeScript files under packages/ and tools/
  {
    files: ["packages/**/*.ts", "packages/**/*.tsx", "tools/**/*.ts", "tools/**/*.tsx"],
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
  // Network import guard for packages/** only
  {
    files: ["packages/**/*.ts", "packages/**/*.tsx"],
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
