// 业务错误码与 HTTP 状态映射。

export const Code = {
  ok: 0,
  param: 1001,
  source: 1002,
  capability: 1003,
  method: 1004,
  upstreamTimeout: 2001,
  upstream: 2002,
  upstreamParse: 2003,
  notFound: 3001,
  vip: 3002,
  rate: 4001,
  internal: 5000,
} as const;

const HTTP_STATUS: Record<number, number> = {
  0: 200,
  1001: 400,
  1002: 400,
  1003: 400,
  1004: 405,
  2001: 504,
  2002: 502,
  2003: 502,
  3001: 404,
  3002: 403,
  4001: 429,
  5000: 500,
};

export function httpStatusOf(code: number): number {
  return HTTP_STATUS[code] ?? 500;
}

export class AppError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export function fail(code: number, message: string): never {
  throw new AppError(code, message);
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
