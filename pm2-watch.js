#!/usr/bin/env node
import pm2 from "pm2";
import chalk from "chalk";
import Table from "cli-table3";
import logUpdate from "log-update";
import { execSync } from "child_process";
import fs from "fs";

// =============================
// ServicePath Resolver (reads Nginx default file once)
// =============================

class ServicePathResolver {
  static cache = null;
  static locallist = null;
  static filePath = "/etc/nginx/sites-available/default";

  constructor() {
    if (!ServicePathResolver.cache) {
      const {cache,locallist}= ServicePathResolver.buildMapping();
      ServicePathResolver.cache = cache;
      ServicePathResolver.locallist = locallist;
    }
  }

  static buildMapping() {
    const text = fs.readFileSync(this.filePath, "utf8");

    const upstreamPorts = {};
    const upstreamRegex = /upstream\s+(\w+)\s*\{([^}]+)\}/g;
    let match;
    while ((match = upstreamRegex.exec(text)) !== null) {
      const name = match[1];
      const body = match[2];
      const portMatch = body.match(/127\.0\.0\.1:(\d+)/);
      if (portMatch) {
        upstreamPorts[name] = portMatch[1];
      }
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
          const servicePath = m[1];
          const upstream = m[2];
          if (!servicePathMap[upstream]) servicePathMap[upstream] = [];
          servicePathMap[upstream].push(servicePath);
        }
      }
    }

    const cache = {};
    for (const [upstream, port] of Object.entries(upstreamPorts)) {
      cache[port] = servicePathMap[upstream] || ["Main"];
    }

    return {cache,locallist:servicePathMap};
  }

  getServicePathsByPort = (port) => {
    return (ServicePathResolver.cache[port] || ["N/A"]).join();
  };

  getMainPort = () => {
    for (const [port, servicePaths] of Object.entries(ServicePathResolver.cache)) {
      if (servicePaths.includes("Main")) {
        return port;
      }
    }
    return null;
  };

  getAllServicePathsWithName = () => {
    return ServicePathResolver.locallist;
  }
}

const resolver = new ServicePathResolver();
const Get_ServicePath = resolver.getServicePathsByPort;
const mainPort = resolver.getMainPort()

// =============================
// ARGUMENT PARSING
// =============================
let filterArg = process.argv[2] || null;
let filterList = null;

if (filterArg) {
  try {
    const parsed = JSON.parse(filterArg);
    filterList = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  } catch {
    filterList = filterArg.split(",").map((s) => s.trim());
  }
}

function getTableForAllServicePath() {
  const locallist = resolver.getAllServicePathsWithName()
  const table = new Table({
    head: [chalk.bold("Service Name"), chalk.bold("Service Path(s)")],
    style: { head: ["cyan"], border: ["grey"] },
    wordWrap: true
  });

  for (const [name, paths] of Object.entries(locallist)) {
    table.push([chalk.yellow(name), chalk.green(paths.join(", "))]);
  }

  return table.toString()
}

// =============================
// Helper functions
// =============================
function getPorts(pid) {
  try {
    const result = execSync(`lsof -i -P -n | grep LISTEN | grep ${pid}`, {
      encoding: "utf8",
    });
    const ports = result
      .split("\n")
      .filter(Boolean)
      .map((line) => line.match(/:(\d+)\s/)[1]);
    return ports.join(", ") || "N/A";
  } catch {
    return "N/A";
  }
}

function formatUptime(ms) {
  let sec = Math.floor(ms / 1000);
  if (sec < 60) return sec + "s";
  let min = Math.floor(sec / 60);
  if (min < 60) return min + "m";
  let hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs + "h";
  let days = Math.floor(hrs / 24);
  return days + "d";
}

// =============================
// Render Table
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
    // colWidths: [auto, 30, 12],
    wordWrap: true,
  });

  procs.forEach((p) => {
    const status = p.pm2_env.status;
    const uptime =
      status === "online" && p.pm2_env.pm_uptime
        ? formatUptime(Date.now() - p.pm2_env.pm_uptime)
        : "0";

    const port = getPorts(p.pid);
    let servicePath = Get_ServicePath(port)
    servicePath = mainPort == port ? chalk.magentaBright.bold(servicePath) : servicePath;

    // ✅ Highlight Main service
    const displayId = p.pm_id;
    table.push([
      displayId,
      chalk.yellow(p.name),
      p.pm2_env.namespace || "default",
      p.pm2_env.version || "N/A",
      p.pm2_env.exec_mode,
      p.pid || "N/A",
      status == "online" ? port : "N/A",
      status == "online" ? servicePath : "N/A",
      uptime,
      chalk.magenta(p.pm2_env.restart_time),
      status === "online"
        ? chalk.green.bold("online")
        : chalk.red.bold(status),
      chalk.blue(p.monit.cpu + "%"),
      chalk.green((p.monit.memory / 1024 / 1024).toFixed(1) + "mb"),
      p.pm2_env.username || "N/A",
      p.pm2_env.watch ? chalk.green("enabled") : chalk.gray("disabled"),
    ]);
  });

  return table.toString();
}

// =============================
// Render Details
// =============================
function renderDetails(p) {
  const uptime =
    p.pm2_env.status === "online" && p.pm2_env.pm_uptime
      ? formatUptime(Date.now() - p.pm2_env.pm_uptime)
      : "0";

  const port = getPorts(p.pid);
  const servicePath = Get_ServicePath(port);

  let details = [];
  details.push(chalk.cyan.bold("\n🔍 Process Details\n"));

  details.push(chalk.bold("Name:         ") + chalk.yellow(p.name));
  details.push(chalk.bold("ID:           ") + p.pm_id);
  details.push(chalk.bold("Namespace:    ") + (p.pm2_env.namespace || "default"));
  details.push(chalk.bold("Version:      ") + (p.pm2_env.version || "N/A"));
  details.push(chalk.bold("Exec Mode:    ") + p.pm2_env.exec_mode);
  details.push(chalk.bold("Interpreter:  ") + (p.pm2_env.exec_interpreter || "node"));
  details.push(chalk.bold("Script:       ") + p.pm2_env.pm_exec_path);
  // details.push(chalk.bold("Args:         ") + (p.pm2_env.args || []).join(" "));
  details.push(chalk.bold("PID:          ") + (p.pid || "N/A"));
  details.push(chalk.bold("Port:         ") + (port));
  details.push(chalk.bold("Service Path: ") + (p.pm2_env.status == "online" ? servicePath : "N/A"));
  details.push(chalk.bold("Status:       ") +
    (p.pm2_env.status === "online"
      ? chalk.green.bold("online")
      : chalk.red.bold(p.pm2_env.status)));
  details.push(chalk.bold("Uptime:       ") + uptime);
  details.push(chalk.bold("Restarts:     ") + chalk.magenta(p.pm2_env.restart_time));
  details.push(chalk.bold("User:         ") + (p.pm2_env.username || "N/A"));
  details.push(chalk.bold("Watching:     ") +
    (p.pm2_env.watch ? chalk.green("enabled") : chalk.gray("disabled")));
  details.push(chalk.bold("Instances:    ") + (p.pm2_env.instances || 1));
  details.push(chalk.bold("Max Memory:   ") +
    (p.pm2_env.max_memory_restart
      ? (p.pm2_env.max_memory_restart / 1024 / 1024) + "mb"
      : "N/A"));

  details.push(chalk.bold("CPU:          ") + chalk.blue(p.monit.cpu + "%"));
  details.push(chalk.bold("Memory:       ") +
    chalk.green((p.monit.memory / 1024 / 1024).toFixed(1) + "mb"));

  details.push("\n" + chalk.bold("📂 Paths"));
  details.push(chalk.bold("CWD:          ") + p.pm2_env.pm_cwd);
  details.push(chalk.bold("PM2 Home:     ") + (p.pm2_env.PM2_HOME || "N/A"));
  details.push(chalk.bold("Out Log:      ") + p.pm2_env.pm_out_log_path);
  details.push(chalk.bold("Err Log:      ") + p.pm2_env.pm_err_log_path);
  //   details.push(chalk.bold("Combined:   ") + p.pm2_env.pm_log_path);

  //   details.push("\n" + chalk.bold("🌍 Environment Variables"));
  //   const env = p.pm2_env.env || {};
  //   Object.keys(env).forEach((k) => {
  //     details.push(chalk.bold(k + ": ") + env[k]);
  //   });

  return details.join("\n");
}

// =============================
// Start Monitor
// =============================
function startMonitor() {
  pm2.connect((err) => {
    if (err) {
      console.error(chalk.red("❌ Failed to connect to PM2"), err);
      process.exit(2);
    }

    setInterval(() => {
      pm2.list((err, procs) => {
        if (err) return console.error(chalk.red("❌ Error fetching list"), err);

        let selectedProcs = procs;
        if (filterList) {
          selectedProcs = procs.filter(
            (p) =>
              filterList.includes(String(p.pm_id)) ||
              filterList.includes(p.name)
          );
          if (!selectedProcs.length) {
            logUpdate(chalk.red(`❌ Process(es) "${filterArg}" not found`));
            return;
          }
        }

        let output =
          chalk.cyan.bold("📊 PM2 Live Monitor\n\n") +
          renderTable(selectedProcs);

        if (filterList && selectedProcs.length === 1) {
          output += renderDetails(selectedProcs[0]);
        }
        // output += getTableForAllServicePath()

        logUpdate(output);

      });
    }, 500);
  });
}

startMonitor();
