export function aimDescription(piece, contact, tool, thickness = 0) {
  if (!piece || !contact) return '';
  const angle = Math.round((Math.acos(Math.max(0, Math.min(1, contact.incidence))) * 180) / Math.PI);
  const action =
    contact.energy < 0.1
      ? '角度を変えると当たります'
      : contact.incidence < 0.4
        ? '浅くかすめる角度'
        : tool === 'pick'
          ? '狭く深く刺す'
          : '広く叩き欠く';
  const section = thickness < 0.24 ? '薄い断面' : thickness < 0.65 ? '厚い断面' : '厚い塊';
  return `${piece.name} · ${section} · ${action} · ${angle}°`;
}

export class StrikeReadout {
  reset() {
    this.id = 0;
    this.percent = 0;
    this.changedAt = 0;
    this.phase = 'ready';
  }
  constructor() {
    this.reset();
  }
  strike(id, now) {
    this.id = id;
    this.percent = 0;
    this.changedAt = now;
    this.phase = 'impact';
  }
  update(percent, active, now) {
    if (!this.id) return '床で砕けた分だけ記録。仕込みは自由。';
    if (percent > this.percent + 0.00001) this.changedAt = now;
    this.percent = percent;
    this.phase = active || now - this.changedAt < 0.65 ? 'chain' : 'settled';
    const state =
      this.phase === 'chain'
        ? '連鎖を計算中'
        : percent > 0
          ? '連鎖が落ち着きました'
          : '床破砕なし · 支えや角度を変えてみよう';
    return `一撃 #${this.id} · 床破砕 ${percent.toFixed(1)}% · ${state}`;
  }
}
