/**
 * music-api 浏览器 SDK v__VERSION__
 *
 * 站点一个 <script> 引入即可跨域调用 music-api 全部只读接口。
 * 服务端不设 CORS，跨域取数只能走 JSONP；SDK 负责回调命名、超时、重试、
 * 客户端缓存、并发去重、参数校验与 envelope 拆解，调用方只关心业务参数。
 *
 * 引入（data-* 属性均可省略，省略时自动从脚本地址与当前域名推导）：
 *   <script src="https://api.example.com/sdk.js"
 *           data-origin="my-site"
 *           data-source="netease"
 *           data-quality="high"
 *           data-timeout="15000"></script>
 *
 * 文档：docs/sdk.md；类型：GET /sdk.d.ts
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module !== null && typeof module.exports === 'object') {
    module.exports = api;
  }
  if (root) root.MusicApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var VERSION = '__VERSION__';
  var CALLBACK_PREFIX = '__music_api_cb_';
  var SOURCES = ['netease', 'tencent', 'kugou', 'baidu'];
  var QUALITIES = ['standard', 'high', 'lossless'];
  var TTL_DEFAULT = 300000;
  var TTL = {
    '/v1/search': 60000,
    '/v1/song/url': 60000,
    '/v1/lyric': 3600000,
    '/v1/status': 5000,
    '/v1/source': 5000
  };

  // SDK 侧错误码（服务端业务码原样透传，见 docs/sdk.md 错误码表）
  var CODE = {
    ok: 0,
    timeout: 9001,
    network: 9002,
    aborted: 9003,
    param: 9004,
    env: 9005
  };

  var SDK_SCRIPT_RE = /(?:^|\/)(?:music-)?sdk\.js(?:[?#]|$)/;
  var FALSE_RE = /^(0|false|off|no)$/i;

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isObject(value) {
    return value !== null && typeof value === 'object';
  }

  function assign(target) {
    for (var i = 1; i < arguments.length; i += 1) {
      var source = arguments[i];
      if (!source) continue;
      for (var key in source) {
        if (has(source, key)) target[key] = source[key];
      }
    }
    return target;
  }

  function copy(obj) {
    return assign({}, obj);
  }

  function trim(value) {
    return typeof value === 'string' ? value.replace(/^\s+|\s+$/g, '') : value;
  }

  function now() {
    return Date.now();
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function sortedKeys(obj) {
    var keys = [];
    for (var key in obj) {
      if (has(obj, key)) keys.push(key);
    }
    keys.sort();
    return keys;
  }

  function camel(name) {
    return name.replace(/-([a-z])/g, function (match, letter) {
      return letter.toUpperCase();
    });
  }

  function makeError(code, message, extra) {
    var err = new Error(message);
    err.name = 'MusicApiError';
    err.musicApi = true;
    err.code = code;
    if (extra) {
      for (var key in extra) {
        if (has(extra, key)) err[key] = extra[key];
      }
    }
    return err;
  }

  function isMusicApiError(err) {
    return !!(err && err.musicApi === true && typeof err.code === 'number');
  }

  // ---------------------------------------------------------------------------
  // 客户端缓存：TTL + LRU，只缓存成功 envelope，与 axios/浏览器缓存无关
  // ---------------------------------------------------------------------------

  function MemoryCache(max) {
    this.max = max > 0 ? max : 200;
    this.map = Object.create(null);
    this.order = [];
  }

  MemoryCache.prototype.touch = function (key) {
    var at = this.order.indexOf(key);
    if (at >= 0) this.order.splice(at, 1);
    this.order.push(key);
  };

  MemoryCache.prototype.remove = function (key) {
    delete this.map[key];
    var at = this.order.indexOf(key);
    if (at >= 0) this.order.splice(at, 1);
  };

  MemoryCache.prototype.get = function (key) {
    var entry = this.map[key];
    if (entry === undefined) return undefined;
    if (entry.expireAt <= now()) {
      this.remove(key);
      return undefined;
    }
    this.touch(key);
    return entry.value;
  };

  MemoryCache.prototype.set = function (key, value, ttl) {
    if (!(ttl > 0)) return;
    if (this.map[key] === undefined) {
      this.order.push(key);
      while (this.order.length > this.max) this.remove(this.order[0]);
    }
    this.map[key] = { value: value, expireAt: now() + ttl };
    this.touch(key);
  };

  MemoryCache.prototype.clear = function () {
    this.map = Object.create(null);
    this.order = [];
  };

  // ---------------------------------------------------------------------------
  // 环境探测：脚本地址 → baseUrl；当前域名 → origin；data-* 属性覆盖默认值
  // ---------------------------------------------------------------------------

  function normalizeBase(value) {
    if (!value) return '';
    return String(value).replace(/\/+$/, '');
  }

  function scriptTagOf(doc) {
    if (!doc) return null;
    if (doc.currentScript) return doc.currentScript;
    var list = doc.getElementsByTagName ? doc.getElementsByTagName('script') : [];
    for (var i = list.length - 1; i >= 0; i -= 1) {
      var src = list[i] && list[i].src ? String(list[i].src) : '';
      if (SDK_SCRIPT_RE.test(src)) return list[i];
    }
    return null;
  }

  function detectBase(doc) {
    if (root && typeof root.__MUSIC_API_BASE__ === 'string' && root.__MUSIC_API_BASE__ !== '') {
      return normalizeBase(root.__MUSIC_API_BASE__);
    }
    var script = scriptTagOf(doc);
    if (script && script.src) return normalizeBase(String(script.src).replace(/[^/]*$/, ''));
    if (root && root.location && root.location.origin) return normalizeBase(root.location.origin);
    return '';
  }

  function detectOrigin(location) {
    var host = location && location.hostname ? String(location.hostname) : '';
    var clean = host.replace(/[^A-Za-z0-9._:/-]/g, '').slice(0, 64);
    return clean === '' ? 'web' : clean;
  }

  function attrOf(script, name) {
    if (!script) return undefined;
    var value;
    if (typeof script.getAttribute === 'function') value = script.getAttribute('data-' + name);
    if ((value === null || value === undefined) && script.dataset) value = script.dataset[camel(name)];
    if (value === null || value === undefined) return undefined;
    var text = trim(String(value));
    return text === '' ? undefined : text;
  }

  function readScriptConfig(script) {
    var out = {};
    var base = attrOf(script, 'base-url') || attrOf(script, 'base');
    if (base !== undefined) out.baseUrl = base;
    var origin = attrOf(script, 'origin');
    if (origin !== undefined) out.origin = origin;
    var source = attrOf(script, 'source');
    if (source !== undefined) out.source = source;
    var quality = attrOf(script, 'quality');
    if (quality !== undefined) out.quality = quality;
    var timeout = attrOf(script, 'timeout');
    if (timeout !== undefined) out.timeout = parseInt(timeout, 10);
    var retries = attrOf(script, 'retries');
    if (retries !== undefined) out.retries = parseInt(retries, 10);
    var cache = attrOf(script, 'cache');
    if (cache !== undefined) out.cache = !FALSE_RE.test(cache);
    var debug = attrOf(script, 'debug');
    if (debug !== undefined) out.debug = !FALSE_RE.test(debug);
    return out;
  }

  // ---------------------------------------------------------------------------
  // URL 构造：参数排序（与服务端缓存键一致）、编码、布尔归一
  // ---------------------------------------------------------------------------

  function appendParams(list, params) {
    var keys = sortedKeys(params);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      var value = params[key];
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' && trim(value) === '') continue;
      if (typeof value === 'boolean') value = value ? '1' : '0';
      list.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
  }

  function buildUrl(base, path, params, callbackName, extra) {
    var merged = {};
    assign(merged, params);
    if (extra) assign(merged, extra);
    merged.callback = callbackName;
    var list = [];
    appendParams(list, merged);
    return base + path + '?' + list.join('&');
  }

  // ---------------------------------------------------------------------------
  // JSONP 传输：唯一回调名、超时、脚本错误、AbortSignal、完整清理
  // ---------------------------------------------------------------------------

  function jsonpRequest(url, callbackName, timeoutMs, signal) {
    return new Promise(function (resolve, reject) {
      var doc = root && root.document;
      if (!doc || typeof doc.createElement !== 'function') {
        reject(makeError(CODE.env, 'document is not available'));
        return;
      }
      var parent = doc.head || doc.body || doc.documentElement;
      if (!parent || typeof parent.appendChild !== 'function') {
        reject(makeError(CODE.env, 'document.head is not available'));
        return;
      }

      var settled = false;
      var timer = null;
      var script = null;
      var onAbort = null;

      function cleanup() {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (onAbort !== null && signal && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', onAbort);
          onAbort = null;
        }
        try {
          delete root[callbackName];
        } catch (err) {
          root[callbackName] = undefined;
        }
        if (script !== null && script.parentNode) {
          try {
            script.parentNode.removeChild(script);
          } catch (err) {
            // 节点可能已被外部移除，忽略
          }
        }
        script = null;
      }

      function finish(err, value) {
        if (settled) return;
        settled = true;
        cleanup();
        if (err) reject(err);
        else resolve(value);
      }

      root[callbackName] = function (envelope) {
        finish(null, envelope);
      };

      script = doc.createElement('script');
      script.async = true;
      script.src = url;
      script.onerror = function () {
        finish(makeError(CODE.network, 'jsonp script load failed'));
      };
      script.onload = function () {
        if (!settled) finish(makeError(CODE.network, 'empty jsonp response'));
      };

      if (signal) {
        if (signal.aborted) {
          finish(makeError(CODE.aborted, 'request aborted'));
          return;
        }
        if (typeof signal.addEventListener === 'function') {
          onAbort = function () {
            finish(makeError(CODE.aborted, 'request aborted'));
          };
          signal.addEventListener('abort', onAbort);
        }
      }

      if (timeoutMs > 0) {
        timer = setTimeout(function () {
          finish(makeError(CODE.timeout, 'request timeout after ' + timeoutMs + 'ms'));
        }, timeoutMs);
      }

      try {
        parent.appendChild(script);
      } catch (err) {
        finish(makeError(CODE.network, 'append script failed'));
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 客户端：所有方法共享一份配置、缓存与 in-flight 表
  // ---------------------------------------------------------------------------

  function createClient(options) {
    var cfg = assign(
      {
        baseUrl: '',
        origin: 'web',
        source: 'netease',
        quality: undefined,
        timeout: 15000,
        retries: 0,
        cache: true,
        cacheSize: 200,
        cacheTtl: undefined,
        throwOnError: true,
        noCache: false,
        debug: false,
        signal: undefined,
        onRequest: undefined,
        onResponse: undefined,
        onError: undefined
      },
      options || {}
    );

    var cache = cfg.cache === false ? null : new MemoryCache(Number(cfg.cacheSize) || 200);
    var inflight = Object.create(null);
    var seq = 0;

    function nextCallbackName() {
      seq += 1;
      var salt = Math.random().toString(36).slice(2, 8);
      return CALLBACK_PREFIX + seq + '_' + salt;
    }

    function ttlOf(path, opts) {
      var ttl = opts.cacheTtl;
      if (isObject(ttl)) ttl = ttl[path];
      if (ttl === undefined) ttl = TTL[path];
      if (ttl === undefined) ttl = TTL_DEFAULT;
      ttl = Number(ttl);
      return isFinite(ttl) && ttl > 0 ? ttl : 0;
    }

    function cacheKey(path, params) {
      var keys = sortedKeys(params);
      var parts = [];
      for (var i = 0; i < keys.length; i += 1) {
        var key = keys[i];
        var value = params[key];
        if (value === undefined || value === null || value === '') continue;
        parts.push(key + '=' + String(value));
      }
      return path + '?' + parts.join('&');
    }

    function request(path, params, options) {
      var opts = assign({}, cfg, options || {});
      var query = params || {};
      var key = cacheKey(path, query);
      var useCache = opts.cache !== false && cache !== null;

      if (useCache) {
        var hit = cache.get(key);
        if (hit !== undefined) {
          if (typeof opts.onResponse === 'function') {
            try {
              opts.onResponse(hit, { path: path, params: copy(query), cached: true });
            } catch (err) {
              // 钩子异常不影响主流程
            }
          }
          return Promise.resolve(hit);
        }
      }
      if (inflight[key] !== undefined) return inflight[key];

      var callbackName = nextCallbackName();
      var extra = {};
      if (opts.origin) extra.origin = opts.origin;
      if (opts.noCache) extra._ = String(now());
      var url = buildUrl(opts.baseUrl, path, query, callbackName, extra);
      var attempts = 0;
      var maxRetries = Math.max(0, Number(opts.retries) || 0);

      if (typeof opts.onRequest === 'function') {
        try {
          opts.onRequest({ path: path, params: copy(query), url: url });
        } catch (err) {
          // 钩子异常不影响主流程
        }
      }

      function attempt() {
        return jsonpRequest(url, callbackName, Number(opts.timeout), opts.signal).then(function (envelope) {
          if (!isObject(envelope) || typeof envelope.code !== 'number') {
            throw makeError(CODE.network, 'invalid envelope', { path: path });
          }
          if (envelope.code === 0) {
            if (useCache) cache.set(key, envelope, ttlOf(path, opts));
            return envelope;
          }
          if (opts.throwOnError === false) return envelope;
          throw makeError(envelope.code, envelope.message || 'request failed', {
            path: path,
            params: copy(query),
            source: envelope.source,
            envelope: envelope
          });
        });
      }

      function run() {
        return attempt().catch(function (err) {
          var retriable = isMusicApiError(err) && (err.code === CODE.timeout || err.code === CODE.network);
          if (!retriable || attempts >= maxRetries) throw err;
          attempts += 1;
          return delay(250 * attempts).then(run);
        });
      }

      var pending = run().then(
        function (envelope) {
          delete inflight[key];
          if (typeof opts.onResponse === 'function') {
            try {
              opts.onResponse(envelope, { path: path, params: copy(query), cached: false });
            } catch (err) {
              // 钩子异常不影响主流程
            }
          }
          return envelope;
        },
        function (err) {
          delete inflight[key];
          if (typeof opts.onError === 'function') {
            try {
              opts.onError(err);
            } catch (hookError) {
              // 钩子异常不影响主流程
            }
          }
          throw err;
        }
      );

      inflight[key] = pending;
      return pending;
    }

    function guard(fn) {
      try {
        return fn();
      } catch (err) {
        return Promise.reject(err);
      }
    }

    function requireParam(value, name, path) {
      var text = trim(value);
      if (text === undefined || text === null || text === '') {
        throw makeError(CODE.param, 'missing param: ' + name, { path: path, param: name });
      }
      return String(text);
    }

    function sourceOf(params) {
      var source = params && params.source !== undefined && params.source !== null && params.source !== ''
        ? params.source
        : cfg.source;
      return source === undefined || source === null || source === '' ? 'netease' : String(source);
    }

    function detail(path, input, options, extra) {
      var params = input || {};
      return guard(function () {
        var query = { source: sourceOf(params), id: requireParam(params.id, 'id', path) };
        if (extra) assign(query, extra(params));
        return request(path, query, options);
      });
    }

    function search(input, options) {
      var params = typeof input === 'string' ? { q: input } : (input || {});
      return guard(function () {
        var query = { q: requireParam(params.q, 'q', '/v1/search') };
        if (params.source !== undefined && params.source !== null && params.source !== '' && params.source !== 'all') {
          query.source = String(params.source);
        }
        if (params.type !== undefined && params.type !== null && params.type !== '' && params.type !== 'song') {
          query.type = String(params.type);
        }
        if (params.page !== undefined) query.page = params.page;
        if (params.size !== undefined) query.size = params.size;
        return request('/v1/search', query, options);
      });
    }

    function song(input, options) {
      return detail('/v1/song', input, options);
    }

    function songUrl(input, options) {
      var params = input || {};
      return guard(function () {
        var query = { source: sourceOf(params), id: requireParam(params.id, 'id', '/v1/song/url') };
        var quality = params.quality;
        if (quality === undefined && options && options.quality !== undefined) quality = options.quality;
        if (quality === undefined) quality = cfg.quality;
        if (quality !== undefined && quality !== null && quality !== '') query.quality = String(quality);
        return request('/v1/song/url', query, options);
      });
    }

    function lyric(input, options) {
      return detail('/v1/lyric', input, options);
    }

    function album(input, options) {
      return detail('/v1/album', input, options);
    }

    function artist(input, options) {
      return detail('/v1/artist', input, options);
    }

    function playlist(input, options) {
      return detail('/v1/playlist', input, options, function (params) {
        var extra = {};
        if (params.page !== undefined) extra.page = params.page;
        if (params.size !== undefined) extra.size = params.size;
        return extra;
      });
    }

    function rank(input, options) {
      var params = input || {};
      return guard(function () {
        var query = { source: sourceOf(params) };
        if (params.id !== undefined && params.id !== null && trim(String(params.id)) !== '') query.id = String(params.id);
        return request('/v1/rank', query, options);
      });
    }

    function sources(options) {
      return request('/v1/source', {}, options);
    }

    function status(options) {
      return request('/v1/status', {}, options);
    }

    function play(input, options) {
      var opts = options || {};
      return songUrl(input, opts).then(function (envelope) {
        var url = envelope && envelope.data ? envelope.data.url : undefined;
        if (!url) throw makeError(CODE.param, 'no playable url');
        var AudioCtor = root && root.Audio;
        if (typeof AudioCtor !== 'function') throw makeError(CODE.env, 'Audio is not available');
        var audio = opts.audio || new AudioCtor();
        audio.src = url;
        if (opts.volume !== undefined) audio.volume = opts.volume;
        if (opts.autoplay !== false) {
          var started = audio.play();
          if (started && typeof started.catch === 'function') started.catch(function () {});
        }
        return audio;
      });
    }

    var client = {
      version: VERSION,
      options: cfg,
      defaults: cfg,
      request: request,
      search: search,
      song: song,
      songUrl: songUrl,
      url: songUrl,
      lyric: lyric,
      album: album,
      artist: artist,
      playlist: playlist,
      rank: rank,
      sources: sources,
      source: sources,
      status: status,
      play: play,
      configure: function (patch) {
        assign(cfg, patch || {});
        return client;
      },
      clearCache: function () {
        if (cache !== null) cache.clear();
        return client;
      }
    };

    return client;
  }

  // ---------------------------------------------------------------------------
  // 全局实例：加载时按脚本地址 / 当前域名 / data-* 属性初始化
  // ---------------------------------------------------------------------------

  var doc = root && root.document;
  var scriptTag = scriptTagOf(doc);
  var initial = assign(
    {
      baseUrl: detectBase(doc),
      origin: detectOrigin(root && root.location)
    },
    readScriptConfig(scriptTag)
  );

  var MusicApi = createClient(initial);

  MusicApi.create = function (options) {
    return createClient(assign({}, MusicApi.options, options || {}));
  };
  MusicApi.isError = isMusicApiError;
  MusicApi.CODE = CODE;
  MusicApi.SOURCES = SOURCES.slice();
  MusicApi.QUALITIES = QUALITIES.slice();
  MusicApi.noConflict = function () {
    if (root && root.MusicApi === MusicApi) {
      try {
        delete root.MusicApi;
      } catch (err) {
        root.MusicApi = undefined;
      }
    }
    return MusicApi;
  };

  return MusicApi;
});
