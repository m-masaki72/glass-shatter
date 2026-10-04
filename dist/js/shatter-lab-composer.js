import { SHAPES } from './shatter-catalog.js';
import { parseStagePrompt, makeStage } from './shatter-lab-stage.js';
import { SUPPORT_STAGES } from './shatter-lab-support-stages.js';
import { EXTRA_SUPPORT_STAGES } from './shatter-lab-support-stages-extra.js';
import { STRATEGY_STAGES } from './shatter-lab-strategy-stages.js';
import { DEFAULT_STAGE_PROMPT, saveStageSelection } from './shatter-lab-save.js';

export function bindStageComposer(
  generate,
  complete = () => {},
  { storage, initialPrompt = DEFAULT_STAGE_PROMPT } = {},
) {
  const form = document.querySelector('#stage-composer');
  const input = document.querySelector('#stage-prompt');
  const message = document.querySelector('#stage-message');
  const button = document.querySelector('#stage-generate');
  const presets = document.querySelector('#stage-presets');
  input.value = initialPrompt;
  const initialSpec = parseStagePrompt(initialPrompt);
  let busy = false;
  for (const shape of [
    ...STRATEGY_STAGES,
    ...SUPPORT_STAGES,
    ...EXTRA_SUPPORT_STAGES,
    { id: 'cascade', name: '大落下' },
    { id: 'structure', name: '構造標本' },
    ...SHAPES,
  ]) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.textContent = shape.name;
    choice.dataset.shape = shape.id;
    choice.setAttribute('aria-pressed', String(shape.id === initialSpec.type));
    choice.addEventListener('click', () => {
      input.value = `透明なガラスの${shape.name}`;
      form.requestSubmit();
    });
    presets.append(choice);
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    button.disabled = true;
    for (const choice of presets.children) choice.disabled = true;
    message.textContent = '形と支えを組み立てています…';
    input.removeAttribute('aria-invalid');
    try {
      const spec = parseStagePrompt(input.value);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const stage = makeStage(spec);
      const prepared = generate(stage) || stage;
      const saved = saveStageSelection(storage, spec.text);
      for (const choice of presets.children)
        choice.setAttribute('aria-pressed', String(choice.dataset.shape === spec.type));
      message.textContent = `${spec.name} · ${prepared.solids.length}個の立体部品から生成しました。${saved ? '選択を保存しました。' : 'このブラウザでは選択を保存できません。'}`;
      complete(prepared);
    } catch (error) {
      message.textContent = error.message;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    } finally {
      busy = false;
      button.disabled = false;
      for (const choice of presets.children) choice.disabled = false;
    }
  });
  button.disabled = false;
}
