import { readFileSync, writeFileSync } from 'node:fs';

const CHANGESETS_MANIFEST = 'packages/flutter/package.json';
const PUBSPEC = 'packages/flutter/pubspec.yaml';

const { version } = JSON.parse(readFileSync(CHANGESETS_MANIFEST, 'utf8'));
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (typeof version !== 'string' || !SEMVER.test(version)) {
  throw new Error(`${CHANGESETS_MANIFEST} 의 version 이 유효하지 않다: ${JSON.stringify(version)}`);
}

const pubspec = readFileSync(PUBSPEC, 'utf8');

if (!/^version:/m.test(pubspec)) throw new Error(`${PUBSPEC} 에 version 줄이 없다`);

writeFileSync(PUBSPEC, pubspec.replace(/^version:.*$/m, `version: ${version}`));
console.log(`gsainfoteam_account -> ${version}`);
