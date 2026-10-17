#!/usr/bin/env node
// 生成应用内更新用的 latest.json（tauri-plugin-updater 的静态清单格式）。
// 用法：node scripts/release-manifest.mjs <标签> <安装包路径> <签名文件路径> [发布说明文件] > latest.json
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [tag, installer, signatureFile, notesFile] = process.argv.slice(2);
if (!tag || !installer || !signatureFile) {
  console.error('用法：release-manifest.mjs <标签> <安装包路径> <签名文件路径> [发布说明文件]');
  process.exit(1);
}
const version = tag.replace(/^v/, '');
const repo = process.env.GITHUB_REPOSITORY ?? 'kekemao00/daymark';
const url = `https://github.com/${repo}/releases/download/${tag}/${basename(installer)}`;
const signature = readFileSync(signatureFile, 'utf8').trim();
const notes = notesFile ? readFileSync(notesFile, 'utf8').trim() : `刻忆 ${version}`;
const platform = { signature, url };

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    // 插件先找 windows-x86_64-nsis，再找 windows-x86_64；两个都给上
    'windows-x86_64-nsis': platform,
    'windows-x86_64': platform,
  },
};
process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
