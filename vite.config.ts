import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import commonjs from "@rollup/plugin-commonjs";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react(),
    commonjs({
      include: /node_modules/,
      requireReturnsDefault: "auto",
      esmExternals: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "./lib/main.ts"),
      name: "ARCanvas",
      fileName: "ar-canvas",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react-webcam",
        "three",
        "@react-three/fiber",
        "@react-three/drei",
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "react/jsx-runtime",
          three: "THREE",
          "@react-three/fiber": "ReactThreeFiber",
          "@react-three/drei": "ReactThreeDrei",
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["mind-ar"],
    include: ["long", "seedrandom", "ml-matrix"],
  },
});
