// Tiny Militia Web - Entry Point (TypeScript)
import { Game } from './game.js';
import { NetworkClient } from './net/NetworkClient.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const startBtn = document.getElementById('btn-start-game') as HTMLButtonElement;
  const startFsBtn = document.getElementById('btn-start-fullscreen') as HTMLButtonElement;
  const startOverlay = document.getElementById('start-overlay') as HTMLElement;
  const mpBtn = document.getElementById('btn-mp') as HTMLButtonElement;
  const lobbyOverlay = document.getElementById('lobby-overlay') as HTMLElement;
  const lobbyBack = document.getElementById('btn-lobby-back') as HTMLButtonElement;
  const lobbyNickname = document.getElementById('lobby-nickname') as HTMLInputElement;
  const lobbyCreate = document.getElementById('btn-mp-create') as HTMLButtonElement;
  const lobbyJoin = document.getElementById('btn-mp-join') as HTMLButtonElement;
  const lobbyCodeInput = document.getElementById('lobby-code-input') as HTMLInputElement;
  const lobbyStatus = document.getElementById('lobby-status') as HTMLElement;
  const lobbyRoom = document.getElementById('lobby-room') as HTMLElement;
  const lobbyRoomCode = document.getElementById('lobby-room-code') as HTMLElement;
  const lobbyPlayers = document.getElementById('lobby-players') as HTMLElement;
  const lobbyStart = document.getElementById('btn-mp-start') as HTMLButtonElement;
  const lobbyLeave = document.getElementById('btn-mp-leave') as HTMLButtonElement;

  let game: Game | null = null;
  const net = new NetworkClient();

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

  if (mpBtn && lobbyOverlay && startOverlay) {
    mpBtn.addEventListener('click', () => {
      startOverlay.classList.add('hidden');
      lobbyOverlay.classList.remove('hidden');
    });
  }

  if (lobbyBack) {
    lobbyBack.addEventListener('click', () => {
      lobbyOverlay.classList.add('hidden');
      startOverlay.classList.remove('hidden');
    });
  }

  const setStatus = (t: string) => { if (lobbyStatus) lobbyStatus.textContent = t; };

  if (lobbyCreate) {
    lobbyCreate.addEventListener('click', async () => {
      const nickname = (lobbyNickname?.value || 'Player').trim() || 'Player';
      try {
        setStatus('Creating room...');
        const res = await net.createRoom(nickname);
        lobbyRoomCode.textContent = res.code;
        lobbyRoom.classList.remove('hidden');
        lobbyStart.classList.remove('hidden');
        setStatus(`Room ${res.code} created. Share the code. Waiting for players...`);
        const g = new Game(canvas, { mp: true, net, wsUrl: res.wsPath, nickname });
        lobbyOverlay.classList.add('hidden');
        g.start();
        game = g;
      } catch (e: any) {
        setStatus(`Create failed: ${e?.message || e}`);
      }
    });
  }

  if (lobbyJoin) {
    lobbyJoin.addEventListener('click', async () => {
      const nickname = (lobbyNickname?.value || 'Player').trim() || 'Player';
      const code = (lobbyCodeInput?.value || '').trim().toUpperCase();
      if (code.length !== 6) { setStatus('Enter a 6-character room code.'); return; }
      try {
        setStatus('Joining room...');
        const res = await net.joinRoom(code, nickname);
        lobbyRoomCode.textContent = res.code;
        lobbyRoom.classList.remove('hidden');
        lobbyStart.classList.add('hidden');
        setStatus(`Joined room ${res.code}.`);
        const g = new Game(canvas, { mp: true, net, wsUrl: res.wsUrl, nickname });
        lobbyOverlay.classList.add('hidden');
        g.start();
        game = g;
      } catch (e: any) {
        setStatus(`Join failed: ${e?.message || e}`);
      }
    });
  }

  if (lobbyLeave) {
    lobbyLeave.addEventListener('click', () => {
      net.close();
      lobbyRoom.classList.add('hidden');
      lobbyPlayers.innerHTML = '';
      lobbyOverlay.classList.add('hidden');
      startOverlay.classList.remove('hidden');
    });
  }

  if (lobbyStart) {
    lobbyStart.addEventListener('click', () => {
      net.send({ type: 'start' });
      setStatus('Match starting...');
    });
  }
});