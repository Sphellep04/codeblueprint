const fs = require("fs");
const path = require("path");

const webDist = path.join(__dirname, "..", "web", "dist");
const target = path.join(__dirname, "..", "dist", "ui");

if (!fs.existsSync(webDist)) {
  console.error(`Error: ${webDist} does not exist. Run "npm run build:web" first (or "npm run build" from the root).`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(webDist, target, { recursive: true });
console.log(`Copied ${webDist} -> ${target}`);
