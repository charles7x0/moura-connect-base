import { QualityChecker, CheckContext, CheckResult } from '../types.js';
import { LeituraRaw } from '../../protocols/types.js';
import { config } from '../../config.js';

export const freshnessChecker: QualityChecker = {
  name: 'freshness',
  check(_raw: LeituraRaw, ctx: CheckContext): CheckResult {
    const threshold = config.quality.expectedIntervalMs + config.quality.freshnessMarginMs;
    const isFresh = ctx.latencyMs <= threshold;
    return { penalty: isFresh ? 0 : 20, fresh: isFresh };
  },
};
