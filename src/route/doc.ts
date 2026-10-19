// 文档路由：GET / 与 GET /openapi.json（不包 envelope）。

import { VERSION } from '../config.ts';
import { openapiDocument } from '../docs/index.ts';
import { homePage } from '../web/index.ts';
import type { RouteResult } from '../router.ts';

export async function homeRoute(): Promise<RouteResult> {
  return { raw: { contentType: 'text/html; charset=utf-8', body: homePage(VERSION) } };
}

export async function openapiRoute(): Promise<RouteResult> {
  return { raw: { contentType: 'application/json; charset=utf-8', body: JSON.stringify(openapiDocument(VERSION)) } };
}
