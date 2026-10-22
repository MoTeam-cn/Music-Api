// 浏览器 SDK 静态资源：启动时读取源文件、替换版本号、计算 ETag 与 Last-Modified。
// 源文件直接以 .js / .d.ts 形式维护，无构建步骤。

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { VERSION } from '../config.ts';

const SCRIPT_URL = new URL('./music-sdk.js', import.meta.url);
const TYPES_URL = new URL('./music-sdk.d.ts', import.meta.url);

function etagOf(body: string): string {
  return '"' + createHash('sha256').update(body).digest('hex').slice(0, 16) + '"';
}

function mtimeOf(url: URL): Date {
  try {
    return statSync(url).mtime;
  } catch {
    return new Date();
  }
}

function withVersion(source: string): string {
  return source.split('__VERSION__').join(VERSION);
}

export const SDK_BODY = withVersion(readFileSync(SCRIPT_URL, 'utf8'));
export const SDK_ETAG = etagOf(SDK_BODY);
export const SDK_MTIME = mtimeOf(SCRIPT_URL);

export const SDK_TYPES_BODY = withVersion(readFileSync(TYPES_URL, 'utf8'));
export const SDK_TYPES_ETAG = etagOf(SDK_TYPES_BODY);
export const SDK_TYPES_MTIME = mtimeOf(TYPES_URL);
