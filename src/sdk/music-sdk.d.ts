/**
 * music-api 浏览器 SDK 类型声明 v__VERSION__
 *
 * 用法：
 *   /// <reference path="./music-sdk.d.ts" />
 *   MusicApi.search({ q: '晴天' }).then(function (res) { ... });
 *
 * 也可在 tsconfig.json 的 "files"/"include" 中直接引入本文件。
 */

export type Source = 'netease' | 'tencent' | 'kugou' | 'baidu';
export type SourceOrAll = Source | 'all';
export type Quality = 'standard' | 'high' | 'lossless';

export interface Song {
  source: Source;
  id: string;
  name: string;
  artist: string[];
  album?: string;
  albumId?: string;
  duration: number;
  cover?: string;
  available: boolean;
  vip: boolean;
}

export interface SongDetail extends Song {
  quality: Quality[];
  publishAt?: string;
}

export interface SongUrl {
  source: Source;
  id: string;
  url: string;
  quality: Quality;
  bitrate: number;
  size?: number;
  expireAt?: number;
}

export interface Lyric {
  source: Source;
  id: string;
  lyric: string;
  translation?: string;
}

export interface AlbumDetail {
  source: Source;
  id: string;
  name: string;
  artist: string[];
  cover?: string;
  publishAt?: string;
  song: Song[];
}

export interface ArtistDetail {
  source: Source;
  id: string;
  name: string;
  avatar?: string;
  song: Song[];
}

export interface PlaylistDetail {
  source: Source;
  id: string;
  name: string;
  cover?: string;
  creator?: string;
  count: number;
  page: number;
  size: number;
  total: number;
  hasMore?: boolean;
  song: Song[];
}

export interface RankItem {
  source: Source;
  id: string;
  name: string;
  cover?: string;
  updateAt?: string;
}

export interface RankDetail {
  source: Source;
  id: string;
  name: string;
  cover?: string;
  updateAt?: string;
  song: Song[];
}

export interface SearchPage {
  page: number;
  size: number;
  total: number;
  failed: Source[];
  list: Song[];
}

export interface CapabilityMatrix {
  [source: string]: {
    search: boolean;
    song: boolean;
    url: boolean;
    lyric: boolean;
    album: boolean;
    artist: boolean;
    playlist: boolean;
    rank: boolean;
  };
}

export interface SourceData {
  capability: CapabilityMatrix;
  disable: string[];
}

export interface StatusData {
  version: string;
  uptime: number;
  cache: {
    size: number;
    hit: number;
    miss: number;
    staleHit: number;
    evict: number;
    hitRate: number;
  };
  notice: string;
}

/** 统一响应 envelope：code 为 0 表示成功 */
export interface Envelope<T> {
  code: number;
  message: string;
  data: T;
  source?: Source;
  cost: number;
}

/** SDK 侧错误码（服务端业务码 1001~5000 原样透传） */
export declare const CODE: {
  ok: 0;
  timeout: 9001;
  network: 9002;
  aborted: 9003;
  param: 9004;
  env: 9005;
};

export interface MusicApiError extends Error {
  name: 'MusicApiError';
  musicApi: true;
  code: number;
  path?: string;
  param?: string;
  source?: Source;
  params?: Record<string, unknown>;
  envelope?: Envelope<unknown>;
}

export interface RequestInfo {
  path: string;
  params: Record<string, unknown>;
  url: string;
}

export interface ResponseInfo {
  path: string;
  params: Record<string, unknown>;
  cached: boolean;
}

export interface ClientOptions {
  /** 接口根地址；省略时从 <script src> 自动推导 */
  baseUrl?: string;
  /** 调用来源，服务端必填；省略时取 location.hostname（无域名则 web） */
  origin?: string;
  /** 非搜索接口的默认音源，默认 netease */
  source?: Source;
  /** /v1/song/url 的默认音质，省略则用服务端默认 standard */
  quality?: Quality;
  /** 单次请求超时（毫秒），默认 15000 */
  timeout?: number;
  /** 超时/网络错误的重试次数，默认 0 */
  retries?: number;
  /** 是否启用客户端缓存，默认 true */
  cache?: boolean;
  /** 客户端缓存条数上限，默认 200 */
  cacheSize?: number;
  /** 自定义缓存时长（毫秒）；可传数字或 { [path]: number } */
  cacheTtl?: number | Record<string, number>;
  /** 业务错误是否 reject，默认 true；false 时照常 resolve envelope */
  throwOnError?: boolean;
  /** 给 URL 加时间戳绕过服务端缓存，默认 false（会产生缓存碎片） */
  noCache?: boolean;
  /** 调试日志，默认 false */
  debug?: boolean;
  /** 取消请求 */
  signal?: AbortSignal;
  /** 请求发出前回调 */
  onRequest?: (info: RequestInfo) => void;
  /** 响应到达后回调（含缓存命中） */
  onResponse?: (envelope: Envelope<unknown>, info: ResponseInfo) => void;
  /** 请求失败回调 */
  onError?: (err: MusicApiError) => void;
}

export interface SearchParams {
  q: string;
  source?: SourceOrAll;
  type?: 'song';
  page?: number;
  size?: number;
}

export interface SongParams {
  source?: Source;
  id: string;
}

export interface SongUrlParams extends SongParams {
  quality?: Quality;
}

export interface PlaylistParams extends SongParams {
  page?: number;
  size?: number;
}

export interface RankParams {
  source?: Source;
  id?: string;
}

export interface PlayOptions extends ClientOptions {
  /** 复用已有 Audio 元素 */
  audio?: HTMLAudioElement;
  /** 拿到地址后自动播放，默认 true */
  autoplay?: boolean;
  /** 音量 0~1 */
  volume?: number;
}

export interface MusicApiClient {
  readonly version: string;
  /** 当前生效配置（可直接读，改请用 configure） */
  readonly options: ClientOptions;
  readonly defaults: ClientOptions;
  configure(options: ClientOptions): MusicApiClient;
  clearCache(): MusicApiClient;
  request<T>(path: string, params?: Record<string, unknown>, options?: ClientOptions): Promise<Envelope<T>>;
  search(params: SearchParams | string, options?: ClientOptions): Promise<Envelope<SearchPage>>;
  song(params: SongParams, options?: ClientOptions): Promise<Envelope<SongDetail>>;
  songUrl(params: SongUrlParams, options?: ClientOptions): Promise<Envelope<SongUrl>>;
  /** songUrl 的别名 */
  url(params: SongUrlParams, options?: ClientOptions): Promise<Envelope<SongUrl>>;
  lyric(params: SongParams, options?: ClientOptions): Promise<Envelope<Lyric>>;
  album(params: SongParams, options?: ClientOptions): Promise<Envelope<AlbumDetail>>;
  artist(params: SongParams, options?: ClientOptions): Promise<Envelope<ArtistDetail>>;
  playlist(params: PlaylistParams, options?: ClientOptions): Promise<Envelope<PlaylistDetail>>;
  rank(params?: RankParams, options?: ClientOptions): Promise<Envelope<RankItem[] | RankDetail>>;
  sources(options?: ClientOptions): Promise<Envelope<SourceData>>;
  /** sources 的别名 */
  source(options?: ClientOptions): Promise<Envelope<SourceData>>;
  status(options?: ClientOptions): Promise<Envelope<StatusData>>;
  /** 取直链并播放，返回 Audio 元素 */
  play(params: SongUrlParams, options?: PlayOptions): Promise<HTMLAudioElement>;
}

export interface MusicApi extends MusicApiClient {
  create(options?: ClientOptions): MusicApiClient;
  isError(err: unknown): err is MusicApiError;
  readonly CODE: typeof CODE;
  readonly SOURCES: Source[];
  readonly QUALITIES: Quality[];
  noConflict(): MusicApi;
}

declare const MusicApi: MusicApi;
export default MusicApi;
export { MusicApi };
