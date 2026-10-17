#!/usr/bin/env node
// 同步修改所有带版本号的文件：npm run version:set -- 0.3.0
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  console.error('用法：npm run version:set -- <版本号>，例如 0.3.0 或 0.3.0-beta.1');
  process.exit(1);
}

const edit = (file, fn) => {
  const before = readFileSync(file, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`${file} 没有找到要改的版本号`);
  writeFileSync(file, after);
  console.log(`已更新 ${file}`);
};

const jsonVersion = (text) => text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);

edit('package.json', jsonVersion);
edit('src-tauri/tauri.conf.json', jsonVersion);
// package-lock.json 里根包的版本出现两次（顶层和 packages[""]）
edit('package-lock.json', (t) => {
  let n = 0;
  return t.replace(/("version":\s*")[^"]+(")/g, (m, a, b) => (n++ < 2 ? `${a}${version}${b}` : m));
});
edit('src-tauri/Cargo.toml', (t) => t.replace(/(\[package\][\s\S]*?\nversion = ")[^"]+(")/, `$1${version}$2`));
edit('Cargo.lock', (t) => t.replace(/(\[\[package\]\]\nname = "daymark"\nversion = ")[^"]+(")/, `$1${version}$2`));

console.log(`\n版本已设为 ${version}。接下来：写 .github/release-notes/v${version}.md，提交后打标签 v${version} 并推送。`);
