/** The whole assessment battery, in the brief's dimension order. */

import { CASES_A } from './cases-a.js';
import { CASES_B } from './cases-b.js';
import { CASES_C } from './cases-c.js';
import type { AssessmentCase } from './harness.js';

export const ASSESSMENT_CASES: readonly AssessmentCase[] = [...CASES_A, ...CASES_B, ...CASES_C];
