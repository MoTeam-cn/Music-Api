// 上游请求层：域名白名单、超时、重试、gzip/br 解压、JSONP 剥壳。

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { AppError, Code } from '../core/error.ts';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const HOSTS = new Set<string>([
  'music.163.com',
  'c.y.qq.com',
  'u.y.qq.com',
  'y.qq.com',
  'music.91q.com',
  'api-qianqian.taihe.com',
  'static-qianqian.taihe.com',
  'audio04.dmhmusic.com',
  'img01.dmhmusic.com',
  'songsearch.kugou.com',
  'm.kugou.com',
  'wwwapi.kugou.com',
  'mobilecdn.kugou.com',
  'krcs.kugou.com',
  'lyrics.kugou.com',
  'sharefs.kugou.com',
  'y.gtimg.cn',
]);

export interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  allowHttp?: boolean;
}

interface RawResponse {
  status: number;
  body: Buffer;
  encoding: string | undefined;
}

function assertTarget(target: URL, allowHttp: boolean): void {
  const okProtocol = target.protocol === 'https:' || (allowHttp && target.protocol === 'http:');
  if (!okProtocol) throw new AppError(Code.upstream, 'protocol not allowed');
  if (!HOSTS.has(target.hostname)) throw new AppError(Code.upstream, 'host not allowed: ' + target.hostname);
}

function once(target: URL, opts: RequestOptions): Promise<RawResponse> {
  const timeoutMs = opts.timeoutMs ?? 6000;
  return new Promise((resolve, reject) => {
    const lib = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate',
      ...(opts.headers ?? {}),
    };
    if (opts.body !== undefined) headers['Content-Length'] = String(Buffer.byteLength(opts.body));
    const req = lib(target, { method: opts.method ?? 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks),
          encoding: typeof res.headers['content-encoding'] === 'string' ? res.headers['content-encoding'] : undefined,
        });
      });
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

function decodeBody(raw: RawResponse): Buffer {
  const encoding = raw.encoding ?? '';
  try {
    if (encoding.includes('br')) return brotliDecompressSync(raw.body);
    if (encoding.includes('gzip')) return gunzipSync(raw.body);
    if (encoding.includes('deflate')) return inflateSync(raw.body);
  } catch {
    return raw.body;
  }
  return raw.body;
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('timeout')) return new AppError(Code.upstreamTimeout, 'upstream timeout');
  return new AppError(Code.upstream, 'upstream failed: ' + message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') throw new AppError(Code.upstreamParse, 'empty upstream body');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('(');
    const end = trimmed.lastIndexOf(')');
    if (start > 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start + 1, end));
      } catch {
        throw new AppError(Code.upstreamParse, 'upstream jsonp parse failed');
      }
    }
    throw new AppError(Code.upstreamParse, 'upstream json parse failed');
  }
}

export async function requestText(url: string, opts: RequestOptions = {}): Promise<string> {
  const target = new URL(url);
  assertTarget(target, opts.allowHttp === true);
  const retries = opts.retries ?? 2;
  let lastError: AppError = new AppError(Code.upstream, 'upstream failed');
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await once(target, opts);
      if (res.status >= 200 && res.status < 300) return decodeBody(res).toString('utf8');
      const retriable = res.status >= 500 || res.status === 429;
      const error = new AppError(Code.upstream, 'upstream status ' + res.status);
      if (!retriable) throw error;
      lastError = error;
    } catch (err) {
      const appErr = toAppError(err);
      if (appErr.code === Code.upstream && !String(appErr.message).includes('status 5')) {
        lastError = appErr;
        if (String(appErr.message).includes('status 4')) throw appErr;
      } else {
        lastError = appErr;
      }
    }
    if (attempt < retries) await sleep(200 * (attempt + 1));
  }
  throw lastError;
}

export async function requestJson<T = unknown>(url: string, opts: RequestOptions = {}): Promise<T> {
  const text = await requestText(url, opts);
  return parseJsonText(text) as T;
}
