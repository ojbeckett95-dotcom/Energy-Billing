import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts", "src/middleware.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.join(import.meta.dirname, "src"),
    },
  },
});
