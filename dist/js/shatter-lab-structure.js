import { block } from './shatter-lab-solid.js';
import { bundledColumn } from './shatter-lab-bundles.js';

export function makeStructureStage() {
  const solids = [],
    put = (faces, name) => solids.push({ faces, name });
  for (const side of [-1, 1]) put(block(side * 2.45, 0, 0.7, 0.16, 1.0, 1.0), '構造標本の足');
  put(block(-2.45, 0.16, 0.18, 1.84, 0.2, 1.0, 0.008), '細長い支柱');
  put(block(-2.32, 2.0, 0.44, 0.28, 0.36, 1.0, 0.01), '細い支柱の持送り');
  solids.push(
    ...bundledColumn({
      x: 2.45,
      bottom: 0.16,
      width: 0.5,
      height: 1.54,
      depth: 0.6,
      z: 1.0,
      name: '右束ね柱',
    }),
  );
  put(block(2.38, 1.7, 0.56, 0.4, 0.36, 1.0, 0.012), '厚い持送り');
  put(block(-1.4, 2.16, 1.4, 0.12, 1.8), '薄いプレート');
  put(block(0, 1.84, 1.4, 0.44, 1.8), '厚いプレート');
  put(block(1.4, 1.42, 1.4, 0.86, 1.8), '太いガラスブロック');
  put(block(0.65, 2.28, 1.1, 0.82, 1.1), '太い上部ブロック');
  put(block(-0.8, 2.28, 1.3, 0.09, 0.9, 0.24, 0.015), '薄い上部プレート');
  return {
    solids,
    hint: '右の太い支持は4本の細柱と接合カラー。残った柱を見ながら仕込み、最後の支えを断とう。厚板・大きな塊はまとめて床へ落とせます。',
    viewElevation: 0.38,
  };
}
