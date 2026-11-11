import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Everything outside the core goes through its public interface, "@/core".
    ignores: ["src/core/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/core/*", "**/core/*"], message: 'Import the Maasii core from "@/core" only.' }] },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
