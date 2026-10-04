import { makeChandelierStage } from './shatter-lab-chandelier.js';
import { makeCutgateStage } from './shatter-lab-cutgate.js';

export const STRATEGY_STAGES = [
  {
    id: 'chandelier',
    name: '連鎖シャンデリア',
    pattern: /連鎖シャンデリア|シャンデリア|chandelier/i,
    layoutVersion: 'chandelier-v1',
  },
  {
    id: 'cutgate',
    name: '切り残しの門',
    pattern: /切り残しの門|切り残し|cutgate/i,
    layoutVersion: 'cutgate-v1',
  },
];

export function makeStrategyStage(type) {
  if (type === 'chandelier') return makeChandelierStage();
  if (type === 'cutgate') return makeCutgateStage();
  return null;
}
