'use strict';

const assert = require('assert');
const { formatCodeReference, formatResourceReference } = require('../reference');

assert.strictEqual(formatCodeReference('C:\\repo\\src\\login.ts', 25, 25), 'C:\\repo\\src\\login.ts:25');
assert.strictEqual(formatCodeReference('/home/user/project/src/login.ts', 25, 68), '/home/user/project/src/login.ts:25-68');
assert.strictEqual(formatResourceReference('C:\\repo\\src'), 'C:\\repo\\src');
assert.throws(() => formatCodeReference('/repo/a.ts', 0, 1), /Line range/);
assert.throws(() => formatResourceReference(''), /resource path/);

console.log('reference-format tests passed');
