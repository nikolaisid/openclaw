import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveBundledHooksDir(): string | undefined {
  const override = process.env.OPENCLAW_BUNDLED_HOOKS_DIR?.trim();
  if (override) {
    return override;
  }

  // bun --compile: ship a sibling `hooks/bundled/` next to the executable.
  try {
    const execDir = path.dirname(process.execPath);
    const sibling = path.join(execDir, "hooks", "bundled");
    if (fs.existsSync(sibling)) {
      return sibling;
    }
  } catch {
    // ignore
  }

  // npm: resolve `<packageRoot>/dist/hooks/bundled` relative to this module.
  // bundled-dir.js is compiled to dist/bundled-dir.js
  // We need to find dist/hooks/bundled/ (new layout) or dist/bundled/ (old layout)
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    
    // New layout: bundled hooks moved to dist/hooks/bundled/
    const newLayout = path.join(moduleDir, "hooks", "bundled");
    if (fs.existsSync(newLayout)) {
      return newLayout;
    }

    // Fallback: old layout where bundled hooks were at dist/bundled/
    const oldLayout = path.join(moduleDir, "bundled");
    if (fs.existsSync(oldLayout)) {
      return oldLayout;
    }
  } catch {
    // ignore
  }

  // dev: resolve `<packageRoot>/src/hooks/bundled` relative to dist/bundled-dir.js
  // If moduleDir is dist/, then the project root is one level up
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(moduleDir, "..");
    const srcBundled = path.join(root, "src", "hooks", "bundled");
    if (fs.existsSync(srcBundled)) {
      return srcBundled;
    }
  } catch {
    // ignore
  }

  return undefined;
}
