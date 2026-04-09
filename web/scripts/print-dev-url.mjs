#!/usr/bin/env node
/**
 * Prints LAN URLs for phone + laptop testing.
 * Run on your Mac: npm run lan-urls
 */
import { networkInterfaces } from "os";

const port = process.env.PORT || "5173";
const ips = [];

for (const name of Object.keys(networkInterfaces())) {
  for (const addr of networkInterfaces()[name] || []) {
    if (addr.family === "IPv4" && !addr.internal) {
      ips.push(addr.address);
    }
  }
}

if (ips.length === 0) {
  console.log("No LAN IPv4 found. Connect to Wi‑Fi, then run again.");
  console.log("Fallback: http://127.0.0.1:" + port + "/games/motion (phone cannot use this)");
  process.exit(0);
}

console.log("\n  League Fan — use these on the same Wi‑Fi as this Mac\n");
for (const ip of ips) {
  const root = `http://${ip}:${port}`;
  console.log(`  Laptop (Chrome) — Games hub:     ${root}/games`);
  console.log(`  Laptop (Chrome) — Stadium:      ${root}/games/motion`);
  console.log(`  Phone — Bat page pattern:       ${root}/games/bat?host=<PEER_ID>`);
  console.log(`  (copy full bat URL from stadium after it loads)\n`);
}
