import fs from 'fs';
import path from 'path';

const srcDir = path.resolve('public');
const distDir = path.resolve('dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

if (fs.existsSync(srcDir)) {
  fs.cpSync(srcDir, distDir, { recursive: true });
}

// root aleph.config.json -> dist/aleph.json 백업 복사
const rootConfig = path.resolve('aleph.config.json');
if (fs.existsSync(rootConfig)) {
  fs.copyFileSync(rootConfig, path.join(distDir, 'aleph.json'));
}