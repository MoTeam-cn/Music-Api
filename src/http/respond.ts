// 统一响应：默认 JSON，带 callback 时转 JSONP（恒 200）。不输出任何 CORS 头。
// 支持 gzip、HEAD、静态资源 ETag/Last-Modified 与 304。

import type { ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
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

export interface SendOptions {
  cacheControl?: string;
  cacheState?: string;
  head?: boolean;
  acceptEncoding?: string;
}

export interface RawResponse {
  contentType: string;
  body: string;
  cacheControl?: string;
  etag?: string;
  lastModified?: Date;
}

export interface RawOptions {
  head?: boolean;
  acceptEncoding?: string;
  ifNoneMatch?: string;
  ifModifiedSince?: string;
}

const GZIP_MIN = 1024;

function wantsGzip(acceptEncoding: string | undefined): boolean {
  return acceptEncoding !== undefined && acceptEncoding.includes('gzip');
}

function maybeGzip(body: Buffer, acceptEncoding: string | undefined): Buffer {
  if (body.length < GZIP_MIN || !wantsGzip(acceptEncoding)) return body;
  return gzipSync(body, { level: 6 });
}

export function sendRaw(res: ServerResponse, raw: RawResponse, opts: RawOptions = {}): void {
  const headers: Record<string, string> = {
    'Content-Type': raw.contentType,
    'Cache-Control': raw.cacheControl ?? 'public, max-age=300',
    Vary: 'Accept-Encoding',
    'X-Content-Type-Options': 'nosniff',
  };
  if (raw.etag !== undefined) headers.ETag = raw.etag;
  if (raw.lastModified !== undefined) headers['Last-Modified'] = raw.lastModified.toUTCString();

  const inm = opts.ifNoneMatch?.trim();
  if (raw.etag !== undefined && inm !== undefined && (inm === raw.etag || inm === '*')) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  if (raw.lastModified !== undefined && opts.ifModifiedSince !== undefined) {
    const since = Date.parse(opts.ifModifiedSince);
    if (Number.isFinite(since) && raw.lastModified.getTime() <= since + 999) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
  }

  const buf = maybeGzip(Buffer.from(raw.body, 'utf8'), opts.acceptEncoding);
  if (buf.length !== Buffer.byteLength(raw.body)) headers['Content-Encoding'] = 'gzip';
  headers['Content-Length'] = String(buf.length);
  res.writeHead(200, headers);
  if (opts.head === true) res.end();
  else res.end(buf);
}

export function send(res: ServerResponse, envelope: Envelope, callback?: string, opts: SendOptions = {}): void {
  const out = render(envelope, callback);
  const buf = maybeGzip(Buffer.from(out.body, 'utf8'), opts.acceptEncoding);
  const headers: Record<string, string> = {
    'Content-Type': out.contentType,
    'Content-Length': String(buf.length),
    'Cache-Control': opts.cacheControl ?? 'no-store',
    Vary: 'Accept-Encoding',
    'X-Content-Type-Options': 'nosniff',
  };
  if (opts.cacheState !== undefined) headers['X-Cache'] = opts.cacheState;
  if (buf.length !== Buffer.byteLength(out.body)) headers['Content-Encoding'] = 'gzip';
  res.writeHead(out.status, headers);
  if (opts.head === true) res.end();
  else res.end(buf);
}
