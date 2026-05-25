const FORBIDDEN = new Set([
  "node:net",
  "node:http",
  "node:https",
  "node:tls",
  "node:dgram",
  "http",
  "https",
  "net",
  "tls",
  "dgram",
  "node-fetch",
  "undici",
  "axios",
  "got",
]);

const NET_PACKAGE_RE = /[\/\\]packages[\/\\]net[\/\\]/;

export default {
  meta: {
    type: "problem",
    docs: { description: "Forbid network imports outside packages/net" },
    messages: {
      forbidden:
        "Network module '{{name}}' may only be imported from packages/net. Move the call there and expose a typed function.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    if (NET_PACKAGE_RE.test(filename)) return {};

    function check(node, source) {
      if (FORBIDDEN.has(source)) {
        context.report({ node, messageId: "forbidden", data: { name: source } });
      }
    }

    return {
      ImportDeclaration(node) {
        if (node.source && typeof node.source.value === "string") {
          check(node, node.source.value);
        }
      },
      CallExpression(node) {
        // require('...')
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments[0]?.type === "Literal" &&
          typeof node.arguments[0].value === "string"
        ) {
          check(node, node.arguments[0].value);
        }
      },
    };
  },
};
