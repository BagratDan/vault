// Boots the resolver hook. Used via:
//   tsx --import=./tests/qvac-mock/register.js src/index.ts
import { register } from "node:module";

register("./loader.mjs", import.meta.url);
