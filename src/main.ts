// Tiny Militia Web - Entry Point (TypeScript)
import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const startBtn = document.getElementById('btn-start-game') as HTMLButtonElement;
  const startOverlay = document.getElementById('start-overlay') as HTMLElement;

  let game: Game | null = null;

  if (startBtn && startOverlay && canvas) {
    startBtn.addEventListener('click', () => {
      startOverlay.classList.add('hidden');
      game = new Game(canvas);
      game.start();
    });
  }
});
