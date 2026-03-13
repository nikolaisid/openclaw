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

  // npm: resolve `<packageRoot>/dist/hooks/bundled` relative to this module (compiled hooks).
  // This path works when installed via npm: node_modules/openclaw/dist/hooks/bundled-dir.js
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const distBundled = path.join(moduleDir, "bundled");
    console.log(`[resolveBundledHooksDir] Module dir: ${moduleDir}`);
    console.log(`[resolveBundledHooksDir] Checking npm path: ${distBundled}`);
    if (fs.existsSync(distBundled)) {
      console.log(`[resolveBundledHooksDir] Found npm path: ${distBundled}`);
      return distBundled;
    }
  } catch (err) {
    console.log(`[resolveBundledHooksDir] Error checking npm path: ${err}`);
  }

  // dev: resolve `<packageRoot>/src/hooks/bundled` relative to dist/hooks/bundled-dir.js
  // This path works in dev: dist/hooks/bundled-dir.js -> ../../src/hooks/bundled
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(moduleDir, "..", "..");
    const srcBundled = path.join(root, "src", "hooks", "bundled");
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
