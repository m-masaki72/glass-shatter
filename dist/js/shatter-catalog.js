export const MATERIALS = {
  glass: { name: 'ガラス', label: 'CRYSTAL GLASS', color: '#afe4cd', density: 2.5, toughness: 1, layers: 3 },
  wood: { name: '木材', label: 'NATURAL WOOD', color: '#b87a3e', density: 0.7, toughness: 1.2, layers: 2 },
  chocolate: {
    name: 'チョコ',
    label: 'DARK CHOCOLATE',
    color: '#653320',
    density: 1.3,
    toughness: 0.78,
    layers: 2,
  },
};

export const SHAPES = [
  { id: 'castle', name: '城', pattern: /城|キャッスル|castle|palace/, glassName: 'クリスタル・キャッスル' },
  {
    id: 'building',
    name: 'ビル',
    pattern: /ビル|building|skyscraper/,
    glassName: 'クリスタル・ビルディング',
  },
  { id: 'vase', name: 'ツボ', pattern: /ツボ|つぼ|壺|花瓶|vase|urn/, glassName: 'クリスタル・ベース' },
  { id: 'keyboard', name: 'キーボード', pattern: /キーボード|keyboard/, glassName: 'クリスタル・キーボード' },
  {
    id: 'phone',
    name: '携帯電話',
    pattern: /携帯|スマホ|電話|phone|mobile/,
    glassName: 'クリスタル・フォン',
  },
  { id: 'heart', name: 'ハート', pattern: /ハート|heart|♡|♥/, glassName: 'グラス・ハート' },
  { id: 'star', name: '星', pattern: /星|スター|star/, glassName: 'シューティング・スター' },
  {
    id: 'bottle',
    name: 'ボトル',
    pattern: /瓶|びん|ビン|ボトル|bottle|ワイン|wine/,
    glassName: 'グラス・ボトル',
  },
  {
    id: 'diamond',
    name: '宝石',
    pattern: /宝石|ダイヤ|クリスタル|diamond|gem|crystal/,
    glassName: 'クリスタル・ジェム',
  },
  { id: 'tower', name: 'タワー', pattern: /タワー|塔|tower/, glassName: 'グラス・タワー' },
  { id: 'panel', name: 'パネル', pattern: /窓|壁|パネル|window|wall|panel/, glassName: 'グラス・パネル' },
];

export function detectMaterial(text) {
  if (/チョコ|ショコラ|chocolat/.test(text)) return 'chocolate';
  if (/木材|木製|木の|wood|timber/.test(text)) return 'wood';
  return 'glass';
}

export function recipePrompt(spec, colors) {
  const shape = SHAPES.find((item) => item.id === spec.type)?.name || 'パネル';
  const color = spec.material === 'glass' ? `${colors[spec.color].name}色の` : '';
  const size = spec.size > 1 ? '大きな' : spec.size < 1 ? '小さな' : '';
  return `${color}${MATERIALS[spec.material].name}の${size}${shape}を${spec.count}つ`;
}
