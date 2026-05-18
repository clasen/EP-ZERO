const { copyFileSync, mkdirSync } = require("node:fs");
const { dirname, join } = require("node:path");

const from = join(process.cwd(), "src/main/preload.cjs");
const to = join(process.cwd(), "dist/main/preload.cjs");

mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
