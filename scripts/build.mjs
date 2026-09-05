import { cp, mkdir } from "node:fs/promises";

await mkdir("dist/client", { recursive: true });
await mkdir("dist/server", { recursive: true });
await cp("src", "dist/client", { recursive: true });
await cp("worker", "dist/server", { recursive: true });
console.log("Cloud-backed site built in dist/");
