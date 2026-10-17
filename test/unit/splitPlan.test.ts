import * as assert from 'node:assert/strict';
import { pathsToStage, validatePlan } from '../../src/features/splitPlan';

const units = [{ path: 'a.ts' }, { path: 'b.ts' }, { path: 'new.ts', oldPath: 'old.ts' }];

describe('validatePlan', () => {
  it('accepts a plan covering every file once', () => {
    const r = validatePlan(
      { commits: [{ files: ['a.ts', 'new.ts'], message: ' feat: a ' }, { files: ['b.ts'], message: 'fix: b' }] },
      units,
    );
    assert.ok(r.ok);
    assert.equal(r.groups[0]?.message, 'feat: a');
  });

  it('reports missing, duplicate and unknown files', () => {
    const r = validatePlan(
      { commits: [{ files: ['a.ts', 'zzz.ts'], message: 'x' }, { files: ['a.ts'], message: 'y' }] },
      units,
    );
    assert.ok(!r.ok);
    const all = r.errors.join('\n');
    assert.match(all, /Unknown path "zzz.ts"/);
    assert.match(all, /"a.ts" appears in both commit 1 and commit 2/);
    assert.match(all, /Missing from every commit: "b.ts", "new.ts"/);
  });

  it('rejects empty messages, empty groups and wrong shapes', () => {
    assert.ok(!validatePlan(null, units).ok);
    assert.ok(!validatePlan({ commits: 'no' }, units).ok);
    const r = validatePlan({ commits: [{ files: [], message: '' }] }, [{ path: 'a.ts' }]);
    assert.ok(!r.ok);
    assert.equal(r.errors.length, 3);
  });
});

describe('pathsToStage', () => {
  it('adds the old path of renames', () => {
    assert.deepEqual(pathsToStage(['a.ts', 'new.ts'], units), ['a.ts', 'new.ts', 'old.ts']);
  });
});
