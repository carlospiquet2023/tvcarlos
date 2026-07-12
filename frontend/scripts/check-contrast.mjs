const pairs = [
  ['texto principal / branco', '#172033', '#ffffff', 4.5],
  ['texto secundario / branco', '#52627a', '#ffffff', 4.5],
  ['placeholder / branco', '#66758a', '#ffffff', 4.5],
  ['acao primaria / branco', '#ffffff', '#4f46e5', 4.5],
  ['sucesso / branco', '#047857', '#ffffff', 4.5],
  ['perigo / branco', '#b91c1c', '#ffffff', 4.5],
  ['aviso / fundo suave', '#92400e', '#fffbeb', 4.5],
  ['link / fundo azul suave', '#1d4ed8', '#eff6ff', 4.5],
  ['admin / badge', '#9d174d', '#fdf2f8', 4.5],
  ['professor / badge', '#155e75', '#ecfeff', 4.5],
  ['aluno / badge', '#047857', '#ecfdf5', 4.5],
  ['equipe / badge', '#4338ca', '#eef2ff', 4.5],
  ['responsavel / badge', '#7e22ce', '#faf5ff', 4.5],
];

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

let failed = false;
for (const [name, foreground, background, minimum] of pairs) {
  const measured = ratio(foreground, background);
  if (measured < minimum) {
    failed = true;
    console.error(`FALHA ${name}: ${measured.toFixed(2)}:1 (minimo ${minimum}:1)`);
  }
}

if (failed) process.exit(1);
console.log(`Contraste WCAG AA validado em ${pairs.length} combinacoes criticas.`);
