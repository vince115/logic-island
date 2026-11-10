// Shared Trial System T.3C browser acceptance (docs/exam-system/27 §10): every CCAR-F question counts as published in a
// THROWAWAY COPY (see trials-published-fixture.mjs).
//
//   node e2e/fixtures/ccarf-published-fixture.mjs <copy dir>      (e.g. a `git archive HEAD | tar -x` copy)
import { applyFixture } from './trials-published-fixture.mjs';

applyFixture(process.argv[2], ['ccarf-']);
