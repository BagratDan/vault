import { RuleTester } from "eslint";
import rule from "../no-network-imports-outside-net.js";

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-network-imports-outside-net", rule, {
  valid: [
    // Allowed inside packages/net
    { code: "import http from 'node:http';", filename: "/repo/packages/net/src/server.ts" },
    { code: "import 'undici';", filename: "/repo/packages/net/src/fetcher.ts" },
    // Non-network imports anywhere
    { code: "import { z } from 'zod';", filename: "/repo/packages/domain/src/index.ts" },
  ],
  invalid: [
    {
      code: "import http from 'node:http';",
      filename: "/repo/packages/app/src/bad.ts",
      errors: [{ messageId: "forbidden" }],
    },
    {
      code: "import fetch from 'node-fetch';",
      filename: "/repo/packages/web/src/bad.ts",
      errors: [{ messageId: "forbidden" }],
    },
    {
      code: "const a = require('axios');",
      filename: "/repo/packages/ai/src/bad.ts",
      errors: [{ messageId: "forbidden" }],
    },
  ],
});

console.log("rule tests passed");
