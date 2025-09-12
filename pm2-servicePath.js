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
          const name = m[2];
          if (!servicePathMap[name]) servicePathMap[name] = [];
          servicePathMap[name].push(servicePath);
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

    all_List = Object.fromEntries(
      Object.entries(all_List).map(([name, values]) => [name, values.filter((v) => filterArg.some((f) => v?.toLowerCase() == f?.toLowerCase() || name?.toLowerCase() == f?.toLowerCase())),]).filter(([_, values]) => values.length > 0) // drop empty arrays
    );
  }
  
  if(!(all_List && Object.entries(all_List) && Object.entries(all_List).length)){
    console.error(`💥 ${ filterArg || ""} <= Service Not Found ❌ `,);
    exit()
  }

  const table = new Table({
    head: [chalk.bold("Service Name"), chalk.bold("Service Path")],
    style: { head: ["cyan"], border: ["grey"] },
  });

  for (const [name, paths] of Object.entries(all_List)) {
    table.push([chalk.yellow(name), chalk.green(paths.join(", "))]);
  }

  console.log(chalk.cyan.bold("\n📊 Service Path List\n"));
  return table.toString();
}

// =============================
// Main
// =============================
console.log(renderServicePathTable());
