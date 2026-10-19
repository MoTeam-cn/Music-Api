// OpenAPI 文档：读同目录 openapi.json，启动时替换版本号。

import { readFileSync } from 'node:fs';

const SPEC = JSON.parse(readFileSync(new URL('./openapi.json', import.meta.url), 'utf8')) as Record<string, any>;

export function openapiDocument(version: string): unknown {
  return { ...SPEC, info: { ...SPEC.info, version } };
}
