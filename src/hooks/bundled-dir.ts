import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveBundledHooksDir(): string | undefined {
  const override = process.env.OPENCLAW_BUNDLED_HOOKS_DIR?.trim();
  if (override) {
    console.log(`[resolveBundledHooksDir] Using env override: ${override}`);
    return override;
  }

  // bun --compile: ship a sibling `hooks/bundled/` next to the executable.
  try {
    const execDir = path.dirname(process.execPath);
    const sibling = path.join(execDir, "hooks", "bundled");
    console.log(`[resolveBundledHooksDir] Checking bun compile sibling: ${sibling}`);
    if (fs.existsSync(sibling)) {
      console.log(`[resolveBundledHooksDir] Found bun sibling: ${sibling}`);
      return sibling;
    }
  } catch {
    console.log(`[resolveBundledHooksDir] Error checking bun sibling`);
  }

  // npm: resolve `<packageRoot>/dist/hooks/bundled` relative to this module.
  // bundled-dir.js is compiled to dist/bundled-dir.js
  // We need to find dist/hooks/bundled/ (new layout) or dist/bundled/ (old layout)
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    console.log(`[resolveBundledHooksDir] Module dir: ${moduleDir}`);
    
    // New layout: bundled hooks moved to dist/hooks/bundled/
    const newLayout = path.join(moduleDir, "hooks", "bundled");
    console.log(`[resolveBundledHooksDir] Checking new layout (dist/hooks/bundled): ${newLayout}`);
    if (fs.existsSync(newLayout)) {
      console.log(`[resolveBundledHooksDir] Found new layout: ${newLayout}`);
      return newLayout;
    }

    // Fallback: old layout where bundled hooks were at dist/bundled/
    const oldLayout = path.join(moduleDir, "bundled");
    console.log(`[resolveBundledHooksDir] Checking old layout (dist/bundled): ${oldLayout}`);
    if (fs.existsSync(oldLayout)) {
      console.log(`[resolveBundledHooksDir] Found old layout: ${oldLayout}`);
      return oldLayout;
    }
  } catch (err) {
    console.log(`[resolveBundledHooksDir] Error checking npm paths: ${err}`);
  }

  // dev: resolve `<packageRoot>/src/hooks/bundled` relative to dist/bundled-dir.js
  // If moduleDir is dist/, then the project root is one level up
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(moduleDir, "..");
    const srcBundled = path.join(root, "src", "hooks", "bundled");
    console.log(`[resolveBundledHooksDir] Project root: ${root}`);
    console.log(`[resolveBundledHooksDir] Checking dev src path: ${srcBundled}`);
    if (fs.existsSync(srcBundled)) {
      console.log(`[resolveBundledHooksDir] Found dev src path: ${srcBundled}`);
      return srcBundled;
    }
  } catch (err) {
    console.log(`[resolveBundledHooksDir] Error checking dev src path: ${err}`);
  }

  console.log(`[resolveBundledHooksDir] No bundled hooks directory found!`);
  return undefined;
}
