import { defineConfig } from "vitest/config";
import path from "path";


export default defineConfig({
  base: 'https://github.com/Ansh191124/Entrope.git',
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/globalSetup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false, // tests share one Postgres test DB — avoid cross-file interference
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
