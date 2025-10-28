import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react(),
    nodeResolve({
      preferBuiltins: false,
    }),
    commonjs({
      include: /node_modules/,
      requireReturnsDefault: "preferred",
      esmExternals: true,
      defaultIsModuleExports: "auto",
      transformMixedEsModules: true,
      dynamicRequireTargets: ["node_modules/long/**/*.js"],
      ignore: (id) => {
        if (
          id.includes("react") ||
          id.includes("three") ||
          id.includes("@react-three")
        ) {
          return true;
        }
        return false;
      },
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
        // CommonJSモジュールのインターオペラビリティを改善
        interop: "auto",
        preserveModules: false,
      },
    },
  },
  optimizeDeps: {
    exclude: ["mind-ar"],
    include: ["long", "seedrandom", "ml-matrix"],
  },
});
