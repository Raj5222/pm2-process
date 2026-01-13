const fs = require("fs");
const path = require("path");

const BASE_DIR = __dirname;
const IGNORE_DIRS = ["node_modules", ".git", ".vscode", "common"];
const frontendNeed = process.argv.includes("true");

/**
 * Helper: Resolve the correct script path or fallback to npm start
 */
const getAppConfig = (name, cwd) => {
  const pkgPath = path.join(cwd, "package.json");

  // 1. Default Safety: If no package.json, skip
  if (!fs.existsSync(pkgPath)) return null;

  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch (e) {
    console.error(`[PM2] Error parsing package.json for ${name}`);
    return null;
  }

  // 2. Determine Entry Point
  let script = "dist/index.js";
  let args = undefined;
  let interpreter = undefined;

  // Check if 'main' is defined in package.json
  if (pkg.main) {
    script = pkg.main;
  }

  const absoluteScriptPath = path.join(cwd, script);

  // 3. Fallback Logic: If the file doesn't exist, try 'npm start'
  if (!fs.existsSync(absoluteScriptPath)) {
    if (pkg.scripts && pkg.scripts.start) {
      console.log(`[PM2] ${name}: Entry file (${script}) not found. Falling back to 'npm start'.`);
      script = "npm";
      args = "start";
      interpreter = "none"; // Important for npm scripts
    } else {
      console.warn(`[PM2] ${name}: Skipped. No entry file and no start script.`);
      return null;
    }
  }

  return {
    name,
    cwd,
    script,
    args,
    interpreter,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "500M",
    env: {
      NODE_ENV: "production",
      ...pkg.env
    }
  };
};

const services = fs.readdirSync(BASE_DIR, { withFileTypes: true })
  .filter(dirent => dirent && dirent.isDirectory() && !IGNORE_DIRS.includes(dirent.name))
  .map(dirent => getAppConfig(dirent.name, path.join(BASE_DIR, dirent.name)))
  .filter(app => app !== null); // Remove nulls (skipped apps)

module.exports = {
  apps: services
};

if (!frontendNeed) {
  //Remove frontend if not needed
  const filteredServices = services.filter(app => !app.name.toLowerCase().includes("frontend"));
  module.exports = {
    apps: filteredServices
  };
}
