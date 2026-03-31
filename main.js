/**
 * KOMBAT ARENA — Electron Main Process
 * Modo Kiosk para Raspberry Pi
 *
 * Atalho para sair: Ctrl+Shift+Q (teclado) ou Botão SELECT+START no gamepad
 */

const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');

// ─── Previne múltiplas instâncias ───
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// ─── Configurações ───
const CONFIG = {
  // Atalho de teclado para encerrar o kiosk
  EXIT_SHORTCUT: 'Ctrl+Shift+Q',

  // Força resolução específica (útil no Raspberry)
  // null = usa a resolução nativa da tela
  FORCE_WIDTH: null,
  FORCE_HEIGHT: null,

  // Arquivo do jogo — sempre relativo ao main.js
  GAME_FILE: path.join(__dirname, 'index.html'),
};

let mainWindow = null;

// ─── Cria a janela principal em modo kiosk ───
function createWindow() {
  mainWindow = new BrowserWindow({
    // kiosk: true já implica fullscreen — não usar os dois juntos no Linux/X11
    // pois pode travar a inicialização no Raspberry Pi
    kiosk: true,
    fullscreen: process.platform !== 'linux', // evita conflito no Raspberry Pi
    frame: false,
    titleBarStyle: 'hidden',

    // Resolução forçada ou automática
    width: CONFIG.FORCE_WIDTH || undefined,
    height: CONFIG.FORCE_HEIGHT || undefined,

    // Fundo preto enquanto carrega (evita flash branco)
    backgroundColor: '#000000',

    // Esconde cursor do mouse (jogo usa gamepad/teclado)
    show: false,

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,

      // webSecurity: true (padrão) — loadFile não precisa desativar
      // Recursos locais (sprites, sons, lib/) são acessíveis via file:// normalmente

      preload: path.join(__dirname, 'preload.js'),

      // Performance no Raspberry Pi
      backgroundThrottling: false,
    },
  });

  // loadFile usa path absoluto resolvido — mais confiável que loadURL('file://')
  mainWindow.loadFile(CONFIG.GAME_FILE)
    .catch((err) => {
      console.error('[Electron] Falha ao carregar o jogo:', err.message);
      console.error('Caminho tentado:', CONFIG.GAME_FILE);
    });

  // Mostra a janela quando estiver pronta (evita flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Esconde o cursor do sistema
    mainWindow.webContents.insertCSS('* { cursor: none !important; }');
  });

  // Previne navegação acidental (segurança kiosk)
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  // Previne abertura de novas janelas
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Log de erros do renderer (útil para debug no Raspberry)
  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) { // warnings e erros
      console.error(`[Renderer] ${message}`);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Otimizações de performance para Raspberry Pi ───
function applyRaspberryOptimizations() {
  // Desativa vsync para reduzir latência de input
  app.commandLine.appendSwitch('disable-gpu-vsync');

  // Zero-copy para canvas (menor uso de CPU)
  app.commandLine.appendSwitch('enable-zero-copy');

  // Reduz uso de memória
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');

  // Força aceleração de hardware (se disponível no Raspberry)
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-accelerated-2d-canvas');

  // Desativa recursos não usados
  app.commandLine.appendSwitch('disable-features', 'TranslateUI,AutofillServerCommunication');
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('disable-sync');
  app.commandLine.appendSwitch('disable-extensions');

  // Raspberry Pi — força OpenGL ES (mais compatível com VideoCore)
  if (process.platform === 'linux') {
    app.commandLine.appendSwitch('use-gl', 'egl');
    app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder');
  }
}

// ─── Registra atalhos globais ───
function registerShortcuts() {
  // Ctrl+Shift+Q — Encerra o kiosk
  globalShortcut.register(CONFIG.EXIT_SHORTCUT, () => {
    console.log(`[Kiosk] Atalho de saída ativado: ${CONFIG.EXIT_SHORTCUT}`);
    quitApp();
  });

  // Alt+F4 bloqueado em modo kiosk (o Electron já bloqueia, mas garantimos)
  // F11 bloqueado (toggleFullscreen)
  globalShortcut.register('F11', () => {});
  globalShortcut.register('Alt+F4', () => {});
  globalShortcut.register('Meta+Q', () => {}); // macOS Cmd+Q bloqueado em kiosk
}

// ─── Encerra o app com limpeza ───
function quitApp() {
  globalShortcut.unregisterAll();
  if (mainWindow) {
    mainWindow.destroy();
  }
  app.quit();
}

// ─── IPC: renderer pode pedir para fechar (ex: botão na tela) ───
ipcMain.on('quit-game', () => {
  console.log('[Kiosk] Solicitação de saída recebida do renderer.');
  quitApp();
});

// ─── Ciclo de vida do Electron ───
applyRaspberryOptimizations();

app.whenReady().then(() => {
  createWindow();
  registerShortcuts();

  // macOS: recriar janela se fechar todas (padrão macOS)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ─── Segurança: bloqueia carregamento de conteúdo externo ───
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (navigationEvent, url) => {
    // Permite apenas file:// (recursos locais do jogo)
    if (!url.startsWith('file://')) {
      console.warn('[Kiosk] Navegação bloqueada:', url);
      navigationEvent.preventDefault();
    }
  });
});