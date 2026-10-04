import { parseStagePrompt } from './shatter-lab-stage.js';

const KEY = 'glass-rush.crystal.selection.v1';
export const DEFAULT_STAGE_PROMPT = '透明なガラスの城';

export function readStageSelection(storage) {
  try {
    const value = JSON.parse(storage?.getItem(KEY));
    if (value?.version !== 1 || typeof value.prompt !== 'string' || value.prompt.length > 100) return null;
    return parseStagePrompt(value.prompt);
  } catch {
    return null;
  }
}

export function saveStageSelection(storage, prompt) {
  try {
    const spec = parseStagePrompt(prompt);
    storage.setItem(KEY, JSON.stringify({ version: 1, prompt: spec.text }));
    return true;
  } catch {
    return false;
  }
}
