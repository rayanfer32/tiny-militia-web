// Tiny Militia Web - Entry Point (TypeScript)
import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const startBtn = document.getElementById('btn-start-game') as HTMLButtonElement;
  const startFsBtn = document.getElementById('btn-start-fullscreen') as HTMLButtonElement;
  const startOverlay = document.getElementById('start-overlay') as HTMLElement;

  let game: Game | null = null;

  if (startFsBtn) {
    startFsBtn.addEventListener('click', () => {
      Game.enterFullscreen();
    });
  }

  if (startBtn && startOverlay && canvas) {
    startBtn.addEventListener('click', () => {
      Game.enterFullscreen();
      startOverlay.classList.add('hidden');
      game = new Game(canvas);
      game.start();
      game.requestPointerLock();
    });
  }
});
