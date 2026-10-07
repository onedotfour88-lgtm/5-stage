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

// root aleph.config.json -> public 및 dist 로 복사 보장
const rootConfig = path.resolve('aleph.config.json');
if (fs.existsSync(rootConfig)) {
  fs.copyFileSync(rootConfig, path.join(distDir, 'aleph.config.json'));
  fs.copyFileSync(rootConfig, path.join(srcDir, 'aleph.config.json'));
}