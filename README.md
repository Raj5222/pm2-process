# 🚀 Node.js Application with PM2

This project uses **PM2** (Process Manager 2) to run and manage the Node.js application in All Env With Ubuntu.

---

## 📦 Requirements

- Node.js (v14 or higher recommended)
- NPM or Yarn
- PM2 installed globally:

```bash
npm install -g pm2
```

- 🚀 PM2 Commands
- Install Node For Sprate Manual Dashbord
```
npm install
```
- Start all processes
```
pm2 start ecosystem.config.js
```

🔹 Process Management
```
pm2 start app.js --name my-app     # Start app with a custom name
pm2 start ecosystem.config.js      # Start all apps from ecosystem file
pm2 restart <name|id>              # Restart a process
pm2 reload <name|id>               # Reload a process (zero-downtime)
pm2 stop <name|id>                 # Stop a process
pm2 delete <name|id>               # Delete a process
pm2 delete all                     # Delete all processes
pm2 list                           # List all running processes
pm2 describe <name|id>             # Detailed process info
```

🔹 Logs & Monitoring
```
pm2 logs                           # View logs of all processes
pm2 logs <name|id>                 # View logs of one process
pm2 monit                          # Real-time CPU & memory monitoring
pm2 info <name|id>                 # Show detailed process info
```

🔹 Startup & Persistence
```
pm2 startup                        # Generate startup script on reboot
pm2 save                           # Save current processes
pm2 resurrect                      # Restore processes after reboot
pm2 unstartup                      # Remove startup script
pm2 kill                           # Kill all processes & PM2 daemon
```

🔹 Maintenance & Updates
```
pm2 reloadLogs                     # Reload all logs
pm2 update                         # Update PM2 to latest version
pm2 reset <name|id>                # Reset restart counters for a process
```


🔹 You Want script executable From Any Where Then Use This For
 `Give Access`
 
```
chmod +x pm2-servicePath.js
chmod +x pm2-watch.js
npm link
```

- Show Indivisual Or Selected processes By Script

> For All
```
pm2-w
```
> For Any Selected
```
pm2-w [<name|id>,<name|id>]
```
> For Any One
```
pm2-w <name|id>
```
