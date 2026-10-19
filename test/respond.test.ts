import assert from 'node:assert/strict';
import test from 'node:test';
import { isCallbackName, render } from '../src/http/respond.ts';

test('json response keeps business code and http mapping', () => {
  const out = render({ code: 3002, message: 'vip', data: null, cost: 3 });
  assert.equal(out.status, 403);
  assert.equal(out.contentType, 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(out.body), { code: 3002, message: 'vip', data: null, cost: 3 });
});

test('jsonp always returns 200 and wraps envelope', () => {
  const out = render({ code: 3002, message: 'vip', data: null, cost: 3 }, 'cb');
  assert.equal(out.status, 200);
  assert.equal(out.contentType, 'application/javascript; charset=utf-8');
  assert.ok(out.body.startsWith("/**/typeof cb === 'function' && cb("));
  assert.ok(out.body.endsWith(');'));
  const payload = JSON.parse(out.body.slice(out.body.indexOf('(') + 1, out.body.lastIndexOf(')')));
  assert.equal(payload.code, 3002);
});

test('callback name whitelist blocks injection', () => {
  assert.equal(isCallbackName('cb'), true);
  assert.equal(isCallbackName('window.music.cb'), true);
  assert.equal(isCallbackName('cb);alert(1)//'), false);
  assert.equal(isCallbackName('a b'), false);
  assert.equal(isCallbackName('x'.repeat(65)), false);
});

test('invalid callback falls back to json 400', () => {
  const out = render({ code: 0, message: 'ok', data: null, cost: 0 }, 'cb);alert(1)//');
  assert.equal(out.status, 400);
  assert.equal(out.contentType, 'application/json; charset=utf-8');
  assert.equal(JSON.parse(out.body).code, 1001);
  assert.equal(out.body.includes('alert(1)'), false);
});
