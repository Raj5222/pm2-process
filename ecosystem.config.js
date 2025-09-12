const fs = require("fs");
const path = require("path");

const baseDir = __dirname; // your micro folder
const services = fs.readdirSync(baseDir).filter(f => {
  const stat = fs.statSync(path.join(baseDir, f));
  return stat.isDirectory();
});

module.exports = {
  apps: services.map(name => {
    const cwd = path.join(baseDir, name);

    // Check if package.json exists
    const pkgPath = path.join(cwd, "package.json");
    let script = "dist/index.js"; // default
    let args = undefined;

    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath));

      // If "start" script exists in package.json, run npm start
      if (pkg.scripts?.start) {
        // script = "npm";
        // args = "start";
      }
    }

    return {
      name, // service name = folder name
      cwd,
      script,
      args,
      watch: false,
      autorestart: true,
      instances: 1,
      exec_mode: "fork",
    //   env: {
    //     NODE_ENV: "production"
    //   }
    };
  })
};
