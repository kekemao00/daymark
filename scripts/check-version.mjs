#!/usr/bin/env node
// 检查 package.json、tauri.conf.json、Cargo.toml、Cargo.lock 里的版本号一致；传入标签时还要求与标签一致。
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(f, 'utf8');
const versions = {
  'package.json': JSON.parse(read('package.json')).version,
  'src-tauri/tauri.conf.json': JSON.parse(read('src-tauri/tauri.conf.json')).version,
  'src-tauri/Cargo.toml': read('src-tauri/Cargo.toml').match(/\[package\][\s\S]*?\nversion = "([^"]+)"/)[1],
  'Cargo.lock': read('Cargo.lock').match(/\[\[package\]\]\nname = "daymark"\nversion = "([^"]+)"/)[1],
};
const distinct = new Set(Object.values(versions));
if (distinct.size !== 1) {
  console.error('版本号不一致，请运行 npm run version:set -- <版本号>：');
  for (const [f, v] of Object.entries(versions)) console.error(`  ${f}: ${v}`);
  process.exit(1);
}
const [version] = distinct;
const tag = process.argv[2];
if (tag && tag !== `v${version}`) {
  console.error(`标签 ${tag} 与应用版本 ${version} 不一致`);
  process.exit(1);
}
console.log(`版本 ${version} 一致${tag ? `，与标签 ${tag} 匹配` : ''}`);
