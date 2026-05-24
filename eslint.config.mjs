import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: [".next/**", "node_modules/**", ".claude/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@next/next": nextPlugin,
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      // Defense in depth against XSS (issue #32). No user-controlled
      // value reaches an HTML sink today — all free-text fields render
      // through auto-escaping JSX. This rule keeps it that way: it
      // fails the build the moment someone introduces
      // `dangerouslySetInnerHTML` (a markdown/rich-text renderer, an
      // inline preview, etc.), forcing a conscious decision about
      // sanitization at that point rather than corrupting every stored
      // bio/title with write-time stripping. The only legitimate sink —
      // JSON-LD in app/[locale]/layout.tsx, fed exclusively by server
      // config + i18n and already escaped via serializeJsonLd — carries
      // an inline disable with that justification.
      "react/no-danger": "error",
    },
  },
  // Must be last: turns off every ESLint rule that conflicts with
  // Prettier's formatting decisions. Prettier still has to run
  // (via `npm run format`) — this just stops ESLint from arguing
  // with it.
  prettierConfig,
];
