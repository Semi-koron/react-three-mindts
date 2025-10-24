import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import commonjs from "@rollup/plugin-commonjs";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), commonjs()],
  build: {
    lib: {
      entry: resolve(__dirname, "./lib/main.ts"),
      name: "Counter",
      fileName: "counter",
      formats: ["es", "cjs"], // ESMとCommonJS両方を出力
    },
    rollupOptions: {
      // React系は外部依存として扱う（利用者側で用意してもらう）
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "react/jsx-runtime",
        },
      },
      // mind-arとlongはexternalに指定しないことで、バンドルに含める
    },
  },
  optimizeDeps: {
    exclude: ["mind-ar"],
    include: ["long", "seedrandom", "ml-matrix"],
  },
});
