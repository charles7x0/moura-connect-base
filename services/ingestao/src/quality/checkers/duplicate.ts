import { QualityChecker, CheckContext, CheckResult } from '../types.js';
import { LeituraRaw } from '../../protocols/types.js';

export const duplicateChecker: QualityChecker = {
  name: 'duplicate',
  check(raw: LeituraRaw, ctx: CheckContext): CheckResult {
    const isDuplicate = ctx.lastTimestamp === raw.timestamp;
    return { penalty: isDuplicate ? 30 : 0, duplicate: isDuplicate };
  },
};
