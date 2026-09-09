#!/usr/bin/env node
import chalk from "chalk";
import Table from "cli-table3";
import fs from "fs";
import { exit } from "process";

// =============================
// ServicePath Resolver
// =============================
class ServicePathResolver {
  static cache = null;
  static filePath = "/etc/nginx/sites-available/default";

  constructor() {
    if (!ServicePathResolver.cache) {
      ServicePathResolver.cache = ServicePathResolver.buildMapping();
    }
  }

  static buildMapping() {
    const text = fs.readFileSync(this.filePath, "utf8");

    // 1. Extract Upstream Ports
    const upstreamMap = {};
    // Matches: upstream name { ... server ip:port; ... }
    const upstreamRegex = /upstream\s+([a-zA-Z0-9_]+)\s*\{[\s\S]*?server\s+[^:]+:(\d+)[^;]*;[\s\S]*?\}/g;
    let match;
    while ((match = upstreamRegex.exec(text)) !== null) {
      const name = match[1];
      const port = match[2];
      upstreamMap[name] = port;
    }

    // 2. Extract Service Paths & Merge
    const servicePathMap = {};
    const mapRegex = /map\s+\$(?:service_id|http_servicepath)\s+\$pool\s*\{([^}]+)\}/;
    const mapMatch = text.match(mapRegex);
    
    if (mapMatch) {
      const lines = mapMatch[1].split("\n");
      for (let line of lines) {
        line = line.trim();
        
        // Skip empty lines or comments
        if (!line || line.startsWith("#")) continue;

        const m = line.match(/^(\S+)\s+"?(\w+)"?;/);
        if (m) {
          const servicePath = m[1];
          const name = m[2];
          
          if (!servicePathMap[name]) {
            servicePathMap[name] = {
              paths: [],
              port: upstreamMap[name] || "Unknown"
            };
          }
          servicePathMap[name].paths.push(servicePath);
        }
      }
    }

    return servicePathMap;
  }

  getAllServicePathsWithName() {
    return ServicePathResolver.cache;
  }
}

// =============================
// Render Service Path Table
// =============================
function renderServicePathTable() {
  const resolver = new ServicePathResolver();
  let all_List = resolver.getAllServicePathsWithName();
  let filterArg = process.argv[2] || null;

  if (filterArg) {
    try {
      const parsed = JSON.parse(filterArg);
      filterArg = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
    } catch {
      filterArg = filterArg.split(",").map((s) => s.trim());
    }

    // Filter logic updated to handle the new nested object structure { paths: [], port: "" }
    all_List = Object.fromEntries(
      Object.entries(all_List)
        .map(([name, data]) => [
          name,
          {
            ...data,
            paths: data.paths.filter((v) =>
              filterArg.some(
                (f) =>
                  v?.toLowerCase() === f?.toLowerCase() ||
                  name?.toLowerCase() === f?.toLowerCase()
              )
            ),
          },
        ])
        .filter(([_, data]) => data.paths.length > 0) // drop if no paths match
    );
  }

  if (!(all_List && Object.entries(all_List).length)) {
    console.error(`💥 ${filterArg || ""} <= Service Not Found ❌ `);
    exit();
  }

  const table = new Table({
    head: [
      chalk.bold("Service Name"),
      chalk.bold("Service Path"),
      chalk.bold("Port")
    ],
    style: { head: ["cyan"], border: ["grey"] },
  });

  for (const [name, data] of Object.entries(all_List)) {
    table.push([
      chalk.yellow(name),
      chalk.green(data.paths.join(", ")),
      chalk.magenta(data.port)
    ]);
  }

  console.log(chalk.cyan.bold("\n📊 Service Path List\n"));
  return table.toString();
}

// =============================
// Main
// =============================
console.log(renderServicePathTable());
