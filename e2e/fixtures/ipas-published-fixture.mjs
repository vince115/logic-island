// Shared Trial System T.2F browser acceptance (docs/exam-system/22 §4): every iPAS question counts as published in a
// THROWAWAY COPY (see trials-published-fixture.mjs).
//
//   node e2e/fixtures/ipas-published-fixture.mjs <copy dir>      (e.g. a `git archive HEAD | tar -x` copy)
import { applyFixture } from './trials-published-fixture.mjs';

applyFixture(process.argv[2], ['ipas-']);
