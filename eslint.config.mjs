import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".source/**", // Generated documentation collection; not authored application code.
    "out/**",
    "build/**",
    "next-env.d.ts",
    "work/**",
    "artifacts/**",
  ]),
]);

export default eslintConfig;
