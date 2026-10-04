import { BestShotRanking } from './shatter-lab-ranking.js';
import { ShotMoment } from './shatter-lab-moment.js';
import { StrikeReadout } from './shatter-lab-readout.js';
import { GamePanels } from './shatter-lab-panels.js';
const AUDIO_KEY = 'glass-rush.crystal.audio.v1';

export function readAudioPreferences(storage) {
  try {
    const value = JSON.parse(storage.getItem(AUDIO_KEY));
    return {
      enabled: typeof value?.enabled === 'boolean' ? value.enabled : true,
      volume: Number.isFinite(value?.volume) ? Math.max(0, Math.min(0.7, value.volume)) : 0.45,
      musicEnabled: typeof value?.musicEnabled === 'boolean' ? value.musicEnabled : true,
    };
  } catch {
    return { enabled: true, volume: 0.45, musicEnabled: true };
  }
}

export function saveAudioPreferences(storage, audio) {
  try {
    storage.setItem(
      AUDIO_KEY,
      JSON.stringify({ enabled: audio.enabled, volume: audio.volume, musicEnabled: audio.musicEnabled }),
    );
  } catch {
    // Storage can be disabled; sound controls still work for this visit.
  }
}

export class PlayExperience {
  constructor({ host, reset, home, cancel, storage }) {
    this.host = host;
    this.panels = new GamePanels({ host, cancel });
    this.ranking = new BestShotRanking(storage);
    this.moment = new ShotMoment();
    this.readout = new StrikeReadout();
    this.readoutLabel = document.querySelector('#shot-readout');
    this.momentLabel = document.querySelector('#shot-moment');
    this.list = document.querySelector('#shot-ranking');
    this.focusButton = document.querySelector('#lab-focus');
    this.focusButton.addEventListener('click', () => this.setFocus(!this.focused, cancel));
    document.querySelector('#focus-exit').addEventListener('click', () => this.setFocus(false, cancel));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.focused && !this.panels.active?.open) this.setFocus(false, cancel);
    });
    document.querySelector('#view-home').addEventListener('click', home);
    document.querySelector('#round-retry').addEventListener('click', () => {
      reset();
      host.focus({ preventScroll: true });
    });
  }
  setFocus(active, cancel, scroll = true) {
    cancel();
    this.panels.close(this.host);
    this.focused = active;
    document.body.classList.toggle('play-focused', active);
    this.focusButton.setAttribute('aria-pressed', String(active));
    this.focusButton.textContent = active ? '通常表示に戻る' : '大きく表示';
    (active ? document.querySelector('#focus-exit') : this.host).focus({ preventScroll: true });
    if (scroll) requestAnimationFrame(() => window.scrollTo(0, 0));
  }
  reset(spec) {
    this.ranking.begin(spec);
    this.previousBest = this.ranking.entries[0]?.score ?? 0;
    document.querySelector('#record-target').textContent =
      this.previousBest > 0 ? `記録 ${this.previousBest.toFixed(1)}%` : '記録 —';
    this.moment.reset();
    this.readout.reset();
    this.readoutLabel.textContent = this.readout.update(0, false, 0);
    this.momentLabel.hidden = true;
    document.querySelector('#chain-best').textContent = '0.0%';
    document.querySelector('#chain-meter').style.width = '0%';
    this.renderRanking();
  }
  strike(world, tool) {
    this.ranking.strike(world.hits, tool);
    this.readout.strike(world.hits, world.clock);
    this.updateReadout(world);
  }
  updateReadout(world) {
    const id = this.readout.id;
    const active =
      [...world.pieces.values()].some((p) => {
        if (!p.dynamic || p.cause !== id || p.floorCredited || p.volume < 0.012) return false;
        const v = p.body.linvel();
        return Math.hypot(v.x, v.y, v.z) > 0.35;
      }) || [...world.pendingBreaks.values()].some((e) => e.p.cause === id);
    const percent =
      world.initialVolume > 0
        ? Math.min(100, ((world.chains.floorVolumes.get(id) ?? 0) / world.initialVolume) * 100)
        : 0;
    this.readoutLabel.textContent = this.readout.update(percent, active, world.clock);
  }
  update(world) {
    this.updateReadout(world);
    if (!this.ranking.update(world.chains.floorVolumes, world.initialVolume)) return;
    document.querySelector('#chain-best').textContent = `${this.ranking.best.toFixed(1)}%`;
    document.querySelector('#chain-meter').style.width = `${this.ranking.best}%`;
    this.renderRanking();
  }
  landing(event, world) {
    const score = ((world.chains.floorVolumes.get(event.cause) ?? 0) / world.initialVolume) * 100;
    if (this.moment.landing(event, score, this.previousBest, world.clock)) this.update(world);
  }
  tick(world) {
    const moment = this.moment.update(world.chains.floorVolumes, world.initialVolume, world.clock);
    this.momentLabel.hidden = !moment;
    if (!moment) return;
    const label =
      moment.previousBest > 0 && moment.score > moment.previousBest + 0.05 ? '自己ベスト' : '大破砕';
    const text = `${label} · ${moment.score.toFixed(1)}%\n床で砕けた、その一撃。`;
    if (this.momentLabel.textContent !== text) this.momentLabel.textContent = text;
  }
  renderRanking() {
    this.list.replaceChildren();
    for (const entry of this.ranking.entries) {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${entry.tool === 'hammer' ? 'ハンマー' : 'ピック'}${entry.id === this.ranking.id ? ' · 今回' : ''}`;
      const score = document.createElement('strong');
      score.textContent = `${entry.score.toFixed(1)}%`;
      item.append(label, score);
      this.list.append(item);
    }
    document.querySelector('#ranking-empty').hidden = this.ranking.entries.length > 0;
    document.querySelector('#ranking-save').textContent = this.ranking.saved
      ? 'このブラウザに保存 · 同じ形・サイズ・個数で比較'
      : '保存を利用できません · 今回の表示のみ';
  }
}
