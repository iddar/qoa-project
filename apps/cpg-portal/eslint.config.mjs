import { defineConfig } from "eslint/config";
import { baseConfig } from "../../eslint.config.base.mjs";

export default defineConfig([
  ...baseConfig,
  {
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);
