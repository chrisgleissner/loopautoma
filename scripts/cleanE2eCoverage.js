import fs from 'node:fs';
import path from 'node:path';

const coverageRoot = path.resolve(process.cwd(), 'coverage-e2e');
const rawDir = path.join(coverageRoot, '.nyc_output');

fs.rmSync(coverageRoot, { recursive: true, force: true });
fs.mkdirSync(rawDir, { recursive: true });

console.log(`[coverage] prepared ${coverageRoot}`);
