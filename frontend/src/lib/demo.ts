import type { Scenario } from './types';

/** The guided demo uses scenario B, the retiree who asks for a guaranteed return. */
export const findDemoScenario = (scenarios: Scenario[]): Scenario | undefined =>
  scenarios.find((s) => /insurance/i.test(s.id)) ?? scenarios.find((s) => /guarantee|retire/i.test(s.title)) ?? scenarios[0];
