// Node ESM resolver hook that swaps @qvac/sdk for the mock when
// VAULT_QVAC_MOCK=1. Register via:
//   node --import=./tests/qvac-mock/register.js ...
//   tsx --import=./tests/qvac-mock/register.js ...

const mockUrl = new URL("./sdk.js", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (process.env.VAULT_QVAC_MOCK === "1" && specifier === "@qvac/sdk") {
    return { url: mockUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
