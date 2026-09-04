import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/client", { recursive: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai/drizzle", { recursive: true });
await cp("src", "dist/client", { recursive: true });
await cp("worker/index.js", "dist/server/index.js");
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
await cp("drizzle", "dist/.openai/drizzle", { recursive: true });
console.log("Cloud-backed site built in dist/");
