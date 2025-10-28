import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const fixLongModule = (filePath) => {
  let content = readFileSync(filePath, "utf-8");

  content = content.replace(
    /const Bs = \(\s*\/\/ tslint:disable-next-line\s*\n\s*Qy\s*\);/,
    "const Bs = ( // tslint:disable-next-line\n  Jy()\n);"
  );

  writeFileSync(filePath, content, "utf-8");
  console.log(`Fixed long module in ${filePath}`);
};

const distDir = resolve(process.cwd(), "dist");
fixLongModule(resolve(distDir, "ar-canvas.js"));
fixLongModule(resolve(distDir, "ar-canvas.cjs"));

console.log("Post-build fixes applied successfully!");
