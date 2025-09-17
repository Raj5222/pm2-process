#!/usr/bin/env node
import pm2 from "pm2";
import chalk from "chalk";
import Table from "cli-table3";
import logUpdate from "log-update";
import { execSync } from "child_process";
import fs from "fs";
import readline from "readline";
import { exit } from "process";

// =============================
// Constants
// =============================
const NGINX_DEFAULT_FILE = "/etc/nginx/sites-available/default";
const MONITOR_INTERVAL = 500; // ms

// =============================
// ServicePathResolver
// =============================
class ServicePathResolver {
  static cache = null;
  static locallist = null;

  constructor() {
    if (!ServicePathResolver.cache) {
      const { cache, locallist } = ServicePathResolver.buildMapping();
      ServicePathResolver.cache = cache;
      ServicePathResolver.locallist = locallist;
    }
  }

  static buildMapping() {
    const text = fs.existsSync(NGINX_DEFAULT_FILE)
      ? fs.readFileSync(NGINX_DEFAULT_FILE, "utf8")
      : "";

    const upstreamPorts = {};
    const upstreamRegex = /upstream\s+(\w+)\s*\{([^}]+)\}/g;
    let match;
    while ((match = upstreamRegex.exec(text))) {
      const [_, name, body] = match;
      const portMatch = body.match(/127\.0\.0\.1:(\d+)/);
      if (portMatch) upstreamPorts[name] = portMatch[1];
    }

    const servicePathMap = {};
    const mapRegex = /map\s+\$http_servicepath\s+\$pool\s*\{([^}]+)\}/;
    const mapMatch = text.match(mapRegex);
    if (mapMatch) {
      const lines = mapMatch[1].split("\n");
      for (let line of lines) {
        line = line.trim();
        const m = line.match(/^(\S+)\s+"?(\w+)"?;/);
        if (m) {
          const [_, servicePath, upstream] = m;
          if (!servicePathMap[upstream]) servicePathMap[upstream] = [];
          servicePathMap[upstream].push(servicePath);
        }
      }
    }

    const cache = {};
    for (const [upstream, port] of Object.entries(upstreamPorts)) {
      cache[port] = servicePathMap[upstream] || ["Main"];
    }

    return { cache, locallist: servicePathMap };
  }

  getServicePathsByPort = (port) => {
    return (ServicePathResolver.cache[port] || ["N/A"]).join();
  };

  getMainPort = () => {
    for (const [port, servicePaths] of Object.entries(ServicePathResolver.cache)) {
      if (servicePaths.includes("Main")) return port;
    }
    return null;
  };
}

// =============================
// Initialization
// =============================
const resolver = new ServicePathResolver();
const Get_ServicePath = resolver.getServicePathsByPort;
const mainPort = resolver.getMainPort();

// =============================
// Argument Parsing
// =============================
let filterArg = process.argv[2] || null;
let showEnv = process.argv[3] ? String(process.argv[3]).toLowerCase() === "env" : false;
let filterList = null;

if (filterArg) {
  try {
    const parsed = JSON.parse(filterArg);
    filterList = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  } catch {
    filterList = filterArg.split(",").map((s) => s.trim());
  }
}

// =============================
// Helpers
// =============================
function getPorts(pid) {
  try {
    const result = execSync(`lsof -i -P -n | grep LISTEN | grep ${pid}`, { encoding: "utf8" });
    return result
      .split("\n")
      .filter(Boolean)
      .map((line) => line.match(/:(\d+)\s/)[1])
      .join(", ") || "N/A";
  } catch {
    return "N/A";
  }
}

function getEnvFileinObj(serviceFolder) {
  const envPath = `${serviceFolder}/.env`;
  if (!fs.existsSync(envPath)) return [];

  const envContent = fs.readFileSync(envPath, "utf8");
  const envConfig = Object.fromEntries(
    envContent.split("\n").filter(Boolean).map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx), line.slice(idx + 1)];
    })
  );
  return envConfig
}

function renderEnvTable(serviceFolder) {
  const envConfig = getEnvFileinObj(serviceFolder);
  const rows = [];
  for (const [key, value] of Object.entries(envConfig)) {
    rows.push(`${chalk.yellow(key)} = ${chalk.green(value)}`);
  }
  return rows;
}

function formatUptime(ms) {
  let sec = Math.floor(ms / 1000);
  if (sec < 60) return sec + "s";
  let min = Math.floor(sec / 60);
  if (min < 60) return min + "m";
  let hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs + "h";
  return Math.floor(hrs / 24) + "d";
}

// =============================
// Scrollable Output Helper
// =============================
function scrollOutput(lines, height = 20, header = null) {
  let offset = 0;

  function render() {
    const visible = lines.slice(offset, offset + height).join("\n");
    logUpdate(
      (header ? chalk.cyan.bold(header) + "\n\n" : "") +
      visible +
      chalk.gray(
        `\n\n▲/▼ scroll, q quit (${offset + 1}-${Math.min(
          lines.length,
          offset + height
        )}/${lines.length})`
      )
    );
  }

  render();

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  process.stdin.on("keypress", (str, key) => {
    if (key.name === "down" && offset + height < lines.length) {
      offset++;
      render();
    } else if (key.name === "up" && offset > 0) {
      offset--;
      render();
    } else if (key.name === "q" || (key.ctrl && key.name === "c")) {
      logUpdate.clear();
      process.exit();
    }
  });
}


// =============================
// Render Tables
// =============================
function renderTable(procs) {
  const table = new Table({
    head: [
      "ID",
      chalk.bold("Micro Name"),
      "Namespace",
      "Version",
      "Mode",
      "PID",
      "Port",
      "Service Path",
      "Uptime",
      "Restarts",
      "Status",
      "CPU",
      "Memory",
      "User",
      "Watching",
    ],
    style: { head: ["green"], border: ["grey"] },
    wordWrap: true,
  });

  procs.forEach((p) => {
    const status = p.pm2_env.status;
    const uptime =
      status === "online" && p.pm2_env.pm_uptime
        ? formatUptime(Date.now() - p.pm2_env.pm_uptime)
        : "0";

    const port = getPorts(p.pid);
    let servicePath = Get_ServicePath(port);
    servicePath = mainPort == port ? chalk.magentaBright.bold(servicePath) : servicePath;

    table.push([
      p.pm_id,
      chalk.yellow(p.name),
      p.pm2_env.namespace || "default",
      p.pm2_env.version || "N/A",
      p.pm2_env.exec_mode,
      p.pid || "N/A",
      status === "online" ? port : "N/A",
      status === "online" ? servicePath : "N/A",
      uptime,
      chalk.magenta(p.pm2_env.restart_time),
      status === "online" ? chalk.green.bold("online") : chalk.red.bold(status),
      chalk.blue(p.monit.cpu + "%"),
      chalk.green((p.monit.memory / 1024 / 1024).toFixed(1) + "mb"),
      p.pm2_env.username || "N/A",
      p.pm2_env.watch ? chalk.green("enabled") : chalk.gray("disabled"),
    ]);
  });

  return table.toString();
}

// =============================
// Render Detailed Process Info
// =============================
function renderDetails(p) {
  const uptime =
    p.pm2_env.status === "online" && p.pm2_env.pm_uptime
      ? formatUptime(Date.now() - p.pm2_env.pm_uptime)
      : "0";

  const port = getPorts(p.pid);
  const servicePath = Get_ServicePath(port);

  return [
    chalk.cyan.bold("\n🔍 Process Details"),
    chalk.bold("Name:         ") + chalk.yellow(p.name),
    chalk.bold("ID:           ") + p.pm_id,
    chalk.bold("Namespace:    ") + (p.pm2_env.namespace || "default"),
    chalk.bold("Version:      ") + (p.pm2_env.version || "N/A"),
    chalk.bold("Exec Mode:    ") + p.pm2_env.exec_mode,
    chalk.bold("Interpreter:  ") + (p.pm2_env.exec_interpreter || "node"),
    chalk.bold("Script:       ") + p.pm2_env.pm_exec_path,
    chalk.bold("PID:          ") + (p.pid || "N/A"),
    chalk.bold("Port:         ") + port,
    chalk.bold("Service Path: ") +
    (p.pm2_env.status === "online" ? servicePath : "N/A"),
    chalk.bold("Status:       ") +
    (p.pm2_env.status === "online"
      ? chalk.green.bold("online")
      : chalk.red.bold(p.pm2_env.status)),
    chalk.bold("Uptime:       ") + uptime,
    chalk.bold("Restarts:     ") + chalk.magenta(p.pm2_env.restart_time),
    chalk.bold("User:         ") + (p.pm2_env.username || "N/A"),
    chalk.bold("Watching:     ") +
    (p.pm2_env.watch ? chalk.green("enabled") : chalk.gray("disabled")),
    chalk.bold("Instances:    ") + (p.pm2_env.instances || 1),
    chalk.bold("Max Memory:   ") +
    (p.pm2_env.max_memory_restart
      ? p.pm2_env.max_memory_restart / 1024 / 1024 + "mb"
      : "N/A"),
    chalk.bold("CPU:          ") + chalk.blue(p.monit.cpu + "%"),
    chalk.bold("Memory:       ") +
    chalk.green((p.monit.memory / 1024 / 1024).toFixed(1) + "mb"),
    "\n" + chalk.bold("📂 Paths"),
    chalk.bold("CWD:          ") + p.pm2_env.pm_cwd,
    chalk.bold("PM2 Home:     ") + (p.pm2_env.PM2_HOME || "N/A"),
    chalk.bold("Out Log:      ") + p.pm2_env.pm_out_log_path,
    chalk.bold("Err Log:      ") + p.pm2_env.pm_err_log_path,
  ];
}

// =============================
// Monitor Loop
// =============================
function startMonitor() {
  pm2.connect((err) => {
    if (err) {
      console.error(chalk.red("❌ Failed to connect to PM2"), err);
      exit(2);
    }

    setInterval(() => {
      pm2.list((err, procs) => {
        if (err){
          console.error(chalk.red("❌ Error fetching list"), err);
          exit(2);
        }

        let selectedProcs = procs;
        if (filterList) {
          if (!filterList.includes("all")) {
            selectedProcs = procs.filter(
              (p) => filterList.includes(String(p.pm_id)) || filterList.includes(p.name)
            );
          }

          if (!selectedProcs.length) {
            logUpdate(chalk.red(`❌ Process "${filterArg}" not found`));
            exit(2)
          }
        }

        let output = chalk.cyan.bold("📊 PM2 Live Monitor\n\n") + renderTable(selectedProcs);

        if (filterList && selectedProcs.length === 1) {
          output += "\n\n" + renderDetails(selectedProcs[0]).join("\n");
        }

        logUpdate(output);
      });
    }, MONITOR_INTERVAL);
  });
}

// =============================
// Start
// =============================
if (showEnv) {
  pm2.connect((err) => {
    if (err) {
      console.error(chalk.red("❌ Failed to connect to PM2"), err);
      exit(2);
    }

    pm2.list((err, procs) => {
      if (err) {
        console.error(chalk.red("❌ Error fetching list"), err);
        exit(2);
      }

      let selectedProcs = procs;
      if (filterList && !filterList.includes("all")) {
        selectedProcs = procs.filter(
          (p) => filterList.includes(String(p.pm_id)) || filterList.includes(p.name) || filterList.includes("all")
        );
      }

      if (!selectedProcs.length) {
        console.error(chalk.red(`❌ Process "${filterArg}" not found`));
        exit(2);
      }

      const envLines = [];
      selectedProcs.forEach((p) => {
        envLines.push(...renderEnvTable(p.pm2_env.pm_cwd), selectedProcs?.length > 1 ? `${chalk.red(`End Env File ${p.name}.`)} \n` : "");
      });

      scrollOutput(envLines, 30, `📦 Environment Variables(${selectedProcs?.map(p => chalk.yellow(p?.name))?.join()})`);
    });
  });
} else {
  startMonitor();
}
