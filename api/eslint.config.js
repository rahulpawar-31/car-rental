import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      sourceType: "module",
    },
  },
  {
    // Every request-facing error here must be an AppError, or the global
    // errorHandler treats it as an unexpected failure: err.isOperational is
    // falsy, so it masks the real message behind a generic 500 in production
    // instead of returning the intended status code. A bare `new Error(...)`
    // passed to upload.middleware.js's fileFilter callback (not even a throw)
    // did exactly this and shipped undetected until a review agent caught it
    // by hand -- this rule makes that bug class impossible to reintroduce.
    files: ["src/controllers/**/*.js", "src/middleware/**/*.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Error']",
          message:
            "Use `new AppError(message, statusCode)` instead of a bare `new Error(...)` here, or the global error handler will mask it as a generic 500.",
        },
      ],
    },
  },
]);
