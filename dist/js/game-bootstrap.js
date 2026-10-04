function showStartupError() {
  document.querySelector('#lab-status').textContent = 'ゲームを開始できませんでした。';
  document.querySelector('#startup-error').hidden = false;
}

try {
  await import('./shatter-lab.js');
  if (!window.crystalLab?.snapshot().ready) throw new Error('Game initialization failed');
  for (const controls of document.querySelectorAll('[data-game-controls]')) controls.inert = false;
} catch {
  showStartupError();
}
