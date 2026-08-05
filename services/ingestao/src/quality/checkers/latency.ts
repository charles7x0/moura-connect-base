import { QualityChecker, CheckContext, CheckResult } from '../types.js';
import { LeituraRaw } from '../../protocols/types.js';
import { config } from '../../config.js';

export const latencyChecker: QualityChecker = {
  name: 'latency',
  check(_raw: LeituraRaw, ctx: CheckContext): CheckResult {
    let penalty = Math.min(50, Math.floor(ctx.latencyMs / 1000));
    if (ctx.latencyMs > config.quality.maxAcceptableLatencyMs) penalty += 20;
    return { penalty };
  },
};
