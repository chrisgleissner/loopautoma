import fs from 'node:fs';
import path from 'node:path';
import istanbulCoverage from 'istanbul-lib-coverage';
import istanbulReport from 'istanbul-lib-report';
import istanbulReports from 'istanbul-reports';

const { createCoverageMap } = istanbulCoverage;
const { createContext } = istanbulReport;
const reports = istanbulReports;

const coverageRoot = path.resolve(process.cwd(), 'coverage-e2e');
const rawDir = path.join(coverageRoot, '.nyc_output');

if (!fs.existsSync(rawDir)) {
  console.warn('[coverage] no e2e coverage directory found');
  process.exit(0);
}

const files = fs.readdirSync(rawDir).filter((file) => file.endsWith('.json'));
if (files.length === 0) {
  console.warn('[coverage] no raw e2e coverage found');
  process.exit(0);
}

const map = createCoverageMap({});
for (const file of files) {
  const absolute = path.join(rawDir, file);
  const data = JSON.parse(fs.readFileSync(absolute, 'utf-8'));
  map.merge(data);
}

if (map.files().length === 0) {
  console.warn('[coverage] merged e2e coverage is empty');
  process.exit(0);
}

fs.mkdirSync(coverageRoot, { recursive: true });

const context = createContext({
  dir: coverageRoot,
  coverageMap: map,
});

reports.create('lcovonly', { file: 'lcov.info' }).execute(context);
reports.create('text-summary').execute(context);

console.log(`[coverage] wrote e2e coverage to ${path.join(coverageRoot, 'lcov.info')}`);
