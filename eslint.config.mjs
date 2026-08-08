import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import next from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  globalIgnores([
    ".next/**",
    ".vinext/**",
    ".wrangler/**",
    "dist/**",
    "dist-pages/**",
    "dist-extension/**",
    "out/**",
    "outputs/**",
    "artifacts/**",
    "work/**",
    "build/**",
    "**/target/**",
    "apps/desktop/src-tauri/gen/**",
    "apps/mobile/android/.gradle/**",
    "apps/mobile/android/**/build/**",
    "apps/mobile/android/app/src/main/assets/public/**",
    "apps/mobile/android/capacitor-cordova-android-plugins/**",
    "apps/mobile/ios/App/App/public/**",
    "apps/mobile/ios/capacitor-cordova-ios-plugins/**",
    "next-env.d.ts",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.flatConfigs.recommended,
  next.configs["core-web-vitals"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
]);

export default eslintConfig;
