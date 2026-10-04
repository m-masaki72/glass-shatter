import { block } from './shatter-lab-solid.js';

export function makeHangingDisplay(type, parts) {
  const keyboard = type === 'keyboard',
    bottom = keyboard ? 1.9 : 1.7,
    width = keyboard ? 4.8 : 1.8,
    front = keyboard ? 0.94 : 1.84,
    hangerTop = bottom + 0.65,
    neckTop = hangerTop + 0.45;
  const object = parts.map((part) => ({
    ...part,
    faces: part.faces.map((face) => ({
      ...face,
      points: face.points.map(([x, y, z]) => (keyboard ? [x, y + bottom, z] : [x, z + 1.9, 1.8 - y])),
    })),
  }));
  const frame = [-1, 1].flatMap((side) => {
    const x = side * (width / 2 + 0.45);
    return [
      { faces: block(x, 0, 0.75, 0.16, 1.1, front), name: '展示フレームの足' },
      { faces: block(x, 0.16, 0.28, neckTop - 0.16, 0.28, front), name: '展示フレームの柱' },
    ];
  });
  return {
    solids: [
      ...frame,
      { faces: block(0, neckTop, width + 1.18, 0.22, 0.28, front), name: '展示フレームの梁' },
      { faces: block(0, hangerTop, 0.22, 0.45, 0.22, front, 0.009), name: '吊り首' },
      { faces: block(0, bottom, 0.5, 0.65, 0.16, front, 0.012), name: '吊りストラップ' },
      ...object,
    ],
    hint: keyboard
      ? '手前中央の細い吊り首が、キーボード全体を支えています。つなぎ目を断ち、基板とキーを床へ落とそう。'
      : '画面を上にした携帯電話を、手前の吊りストラップで展示中。上の細い吊り首を断ち、画面ごと床へ落とそう。',
    viewElevation: 0.4,
  };
}
