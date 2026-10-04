export class CollapseChains {
  constructor() {
    this.volumes = new Map();
    this.floorVolumes = new Map();
    this.latest = 0;
  }
  begin(id) {
    this.latest = id;
    this.volumes.set(id, 0);
    this.floorVolumes.set(id, 0);
  }
  credit(piece, cause) {
    if (piece.credited || !cause || !this.volumes.has(cause)) return;
    piece.credited = true;
    piece.cause = cause;
    this.volumes.set(cause, this.volumes.get(cause) + piece.volume);
  }
  snapshot(total) {
    return this.summarize(this.volumes, total);
  }
  creditFloor(piece, cause) {
    if (piece.floorCredited || !cause || !this.floorVolumes.has(cause)) return;
    piece.floorCredited = true;
    this.floorVolumes.set(cause, this.floorVolumes.get(cause) + piece.volume);
  }
  floorSnapshot(total) {
    return this.summarize(this.floorVolumes, total);
  }
  summarize(volumes, total) {
    const percent = (v) => (total > 0 ? Math.min(100, (v / total) * 100) : 0);
    return {
      strike: this.latest,
      latestPercent: percent(volumes.get(this.latest) ?? 0),
      bestPercent: percent(Math.max(0, ...volumes.values())),
      creditedVolume: [...volumes.values()].reduce((a, b) => a + b, 0),
    };
  }
}
