#!/usr/bin/env node
import pm2 from "pm2";
import chalk from "chalk";

const args = process.argv.slice(2);
const watchFlag = args.includes("-w") || args.includes("--w") || args.includes("--watch");
const target = args.find((a) => !a.startsWith("-"));

function safeExit(code = 0) {
  pm2.disconnect();
  process.exit(code);
}

function restartOnlineOnly(target, toggleWatch) {
  pm2.connect((err) => {
    console.log(chalk.blueBright(`🔄 Restarting ${chalk.yellow("Watch")} ${toggleWatch ? chalk.green("--ON") : chalk.red("--OFF")} PM2 processes ${chalk.yellow("--"+target)}`));
    if (err) {
      console.error(chalk.red("❌ PM2 connect failed"), err);
      return safeExit(2);
    }

    pm2.list(async (err, procs) => {
      if (err) {
        console.error(chalk.red("❌ PM2 list failed"), err);
        return safeExit(2);
      }

      let selected = procs;

      if (target && target !== "all") {
        selected = procs.filter((p) => String(p.pm_id) === target || p.name === target || p.name?.toLowerCase().includes(target.toLowerCase()));
      }

      const onlineOnly = selected.filter((p) => p.pm2_env.status === "online");

      if (!onlineOnly.length) {
        console.log(chalk.yellow("⚠ No online processes found"));
        return safeExit();
      }

      let pending = onlineOnly.length;

      for await (const p of onlineOnly) {
        const restartOpts = toggleWatch
          ? { watch: !p.pm2_env.watch }
          : {};

        pm2.restart(p.pm_id, restartOpts, (err) => {
          if (err) {
            console.error(
              chalk.red("❌ Restart failed"),
              chalk.yellow(p.name),
              err.message
            );
          } else {
            if (toggleWatch) {
              console.log(
                chalk.cyan("👁 Watch"),
                restartOpts.watch
                  ? chalk.green("ENABLED")
                  : chalk.gray("DISABLED"),
                chalk.yellow(p.name)
              );
            }

            console.log(
              chalk.green("♻ Restarted"),
              chalk.yellow(p.name),
              chalk.gray(`#${p.pm_id}`)
            );
          }

          if (--pending === 0) {
            console.log(chalk.blueBright(`✅ Restarted ${onlineOnly.length} online processes`));
            safeExit();
          };
        });
      }
    });
  });
}

/* =============================
   CLI Entry
============================= */

if (!target) {
  console.log(chalk.cyan("Usage:"));
  console.log("  pm2-restart all");
  console.log("  pm2-restart all -w");
  console.log("  pm2-restart <name|id> [-w]");
  process.exit(1);
}

restartOnlineOnly(target, watchFlag);
