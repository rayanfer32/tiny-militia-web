// Tiny Militia Web - Entry Point
import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  const startBtn = document.getElementById('btn-start-game');
  const startOverlay = document.getElementById('start-overlay');

  let game = null;

  startBtn.addEventListener('click', () => {
    startOverlay.classList.add('hidden');
    game = new Game(canvas);
    game.start();
  });
});
