/**
 * KOMBAT ARENA — Preload Script
 * Bridge segura entre o processo principal (main) e o renderer (jogo).
 * Expõe apenas o necessário via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expõe uma API mínima e segura para o renderer
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Solicita o encerramento do app ao processo principal.
   * Chamado pelo botão de saída dentro do jogo (se houver).
   */
  quitGame: () => ipcRenderer.send('quit-game'),

  /**
   * Informa a plataforma para o jogo poder ajustar comportamentos
   * (ex: Linux/Raspberry vs Windows/macOS)
   */
  platform: process.platform,
});