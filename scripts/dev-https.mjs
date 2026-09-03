import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";

const require = createRequire(import.meta.url);

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  return (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    (parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168))
  );
}

function findLanAddress() {
  const candidates = Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter(
      (address) =>
        address.family === "IPv4" &&
        !address.internal &&
        isPrivateIpv4(address.address),
    )
    .map((address) => address.address);

  return (
    candidates.find((address) => address.startsWith("192.168.")) ??
    candidates[0] ??
    null
  );
}

const host = process.env.MEMORA_HTTPS_HOST?.trim() || findLanAddress();
if (!host) {
  console.error(
    "No private LAN IPv4 address was found. Set MEMORA_HTTPS_HOST to the computer's LAN address.",
  );
  process.exit(1);
}

console.log(`Starting Memora HTTPS on https://${host}:3000`);
console.log("The phone must trust the generated mkcert root CA before using camera or microphone access.");

const nextBinary = require.resolve("next/dist/bin/next");
const child = spawn(
  process.execPath,
  [nextBinary, "dev", "--hostname", host, "--experimental-https", ...process.argv.slice(2)],
  { stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exitCode = code ?? 1;
  }
});
