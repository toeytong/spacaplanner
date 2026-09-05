import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/client', { recursive: true });
await cp('src', 'dist/client', { recursive: true });
console.log('Space Planner ready for Cloudflare Workers and D1.');
