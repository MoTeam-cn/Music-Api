// 默认首页：读同目录 home.html，替换版本占位符。

import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('./home.html', import.meta.url), 'utf8');

export function homePage(version: string): string {
  return HTML.split('__VERSION__').join(version);
}
