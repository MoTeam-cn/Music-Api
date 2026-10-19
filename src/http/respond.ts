// 统一响应：默认 JSON，带 callback 时转 JSONP（恒 200）。不输出任何 CORS 头。

import type { ServerResponse } from 'node:http';
import { Code, httpStatusOf } from '../core/error.ts';

export interface Envelope {
  code: number;
  message: string;
  data: unknown;
  source?: string;
  cost: number;
}

const CALLBACK_RE = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*){0,3}$/;

export function isCallbackName(name: string): boolean {
  return name.length > 0 && name.length <= 64 && CALLBACK_RE.test(name);
}

export interface Rendered {
  status: number;
  contentType: string;
  body: string;
}

export function render(envelope: Envelope, callback?: string): Rendered {
  if (callback !== undefined) {
    if (!isCallbackName(callback)) {
      const fallback: Envelope = { code: Code.param, message: 'invalid callback', data: null, cost: envelope.cost };
      return { status: 400, contentType: 'application/json; charset=utf-8', body: JSON.stringify(fallback) };
    }
    const body = '/**/typeof ' + callback + " === 'function' && " + callback + '(' + JSON.stringify(envelope) + ');';
    return { status: 200, contentType: 'application/javascript; charset=utf-8', body };
  }
  return { status: httpStatusOf(envelope.code), contentType: 'application/json; charset=utf-8', body: JSON.stringify(envelope) };
}

export function sendRaw(res: ServerResponse, raw: { contentType: string; body: string }): void {
  const buf = Buffer.from(raw.body, 'utf8');
  res.writeHead(200, {
    'Content-Type': raw.contentType,
    'Content-Length': String(buf.length),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(buf);
}

export function send(res: ServerResponse, envelope: Envelope, callback?: string): void {
  const out = render(envelope, callback);
  const buf = Buffer.from(out.body, 'utf8');
  res.writeHead(out.status, {
    'Content-Type': out.contentType,
    'Content-Length': String(buf.length),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(buf);
}
