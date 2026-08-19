const fs = require("fs");

function readConfig(path) {
  return fs.readFileSync(path, "utf8");
}

module.exports = { readConfig };
