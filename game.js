// ═══════════════════════════════════════════════════════════════
//  DEV KOMBAT  ·  P5.js + ElectronJS Kiosk
//  Controles: 2× Knup KP-3124 USB Gamepad
// ═══════════════════════════════════════════════════════════════

// ── Ambiente ────────────────────────────────────────────────────
const IS_ELECTRON = !!(window.electronAPI);
const PLATFORM = IS_ELECTRON ? window.electronAPI.platform : 'browser';
function quitApp() { if (IS_ELECTRON) window.electronAPI.quitGame(); }

// ── Resolução ───────────────────────────────────────────────────
// No Electron kiosk, window.screen pode reportar antes do modo kiosk ser aplicado.
// window.innerWidth/innerHeight refletem o tamanho real da janela já no kiosk.
const CANVAS_W = IS_ELECTRON ? (window.screen.width || window.innerWidth || 1920) : 960;
const CANVAS_H = IS_ELECTRON ? (window.screen.height || window.innerHeight || 1080) : 540;
const CX = CANVAS_W / 2;
const CY = CANVAS_H / 2;
const GROUND_Y = Math.round(CANVAS_H * 0.80);
const SP_SCALE = Math.max(1.8, CANVAS_W / 384);
const FRAME_W = 128;
const FRAME_H = 128;

console.log('[SK] ' + (IS_ELECTRON ? 'Electron' : 'Browser') + ' | ' + CANVAS_W + 'x' + CANVAS_H);

// ═══════════════════════════════════════════════════════════════
//  FONTE GAMIFICADA — Press Start 2P (offline via lib/)
//  Fallback: VT323 → monospace
//  Instalar: coloque o .woff2 em lib/PressStart2P.woff2
//  Download: https://fonts.gstatic.com/s/pressstart2p/v15/e3t4euO8T-267oIAQAu6jDQyK3nRivN04w.woff2
// ═══════════════════════════════════════════════════════════════
(function () {
  var style = document.createElement('style');
  style.textContent = [
    '@font-face {',
    '  font-family: "SKFont";',
    '  src: url("lib/PressStart2P.woff2") format("woff2"),',
    '       url("lib/PressStart2P.ttf")   format("truetype");',
    '  font-weight: normal; font-style: normal;',
    '}',
    '@font-face {',
    '  font-family: "SKFont";',
    '  src: url("lib/VT323-Regular.ttf") format("truetype");',
    '  font-weight: bold; font-style: normal;',
    '  unicode-range: U+0000-FFFF;',
    '}',
  ].join('\n');
  document.head.appendChild(style);

  // Pré-aquece a fonte no DOM para evitar flash na primeira renderização
  var probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:-999px;font-family:SKFont;font-size:12px;';
  probe.textContent = 'DEV KOMBAT';
  document.body.appendChild(probe);
  setTimeout(function () { document.body.removeChild(probe); }, 3000);
})();

// Fonte ativa — verificada após setup
var GAME_FONT = 'SKFont, monospace';

// ═══════════════════════════════════════════════════════════════
//  SISTEMA DE SOM — 100% offline via Web Audio API
//  Sons gerados proceduralmente — sem arquivos externos
//  Estrutura de pasta opcional para sons reais:
//    sounds/
//      menu_move.wav   menu_confirm.wav  menu_back.wav
//      fight_hit.wav   fight_block.wav   fight_crit.wav
//      fight_dead.wav  round_start.wav   round_win.wav
// ═══════════════════════════════════════════════════════════════
var SFX = (function () {
  var ctx = null;
  var masterVol = 1;
  var buffers = {};   // sons reais carregados de arquivo
  var enabled = true;

  // ── Trilha de combate ─────────────────────────────────────
  var musicNode = null;  // BufferSourceNode (arquivo)
  var musicGain = null;  // GainNode da música
  var drumTimer = null;  // setInterval da batida procedural
  var melodyTimer = null;  // setInterval da melodia procedural
  var musicPlaying = false;

  function init() {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[SFX] Web Audio não disponível:', e);
      enabled = false;
    }
  }

  // Tenta carregar arquivo WAV/OGG real; silencioso se não existir
  function loadFile(name, path) {
    if (!ctx) return;
    fetch(path)
      .then(function (r) { return r.ok ? r.arrayBuffer() : Promise.reject('404'); })
      .then(function (ab) { return ctx.decodeAudioData(ab); })
      .then(function (buf) { buffers[name] = buf; console.log('[SFX] Carregado:', path); })
      .catch(function () { /* arquivo não existe — usa síntese */ });
  }

  // Reproduz buffer carregado ou síntese
  function playBuffer(name, vol) {
    if (!ctx || !enabled) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (buffers[name]) {
      var src = ctx.createBufferSource();
      src.buffer = buffers[name];
      var gain = ctx.createGain();
      gain.gain.value = (vol || 1) * masterVol;
      src.connect(gain); gain.connect(ctx.destination);
      src.start();
    }
  }

  // ── Síntese procedural — sons embutidos ───────────────────
  function synth(type, freq, dur, vol, env, detune) {
    if (!ctx || !enabled) return;
    if (ctx.state === 'suspended') ctx.resume();
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq || 220, now);
    if (detune) osc.detune.setValueAtTime(detune, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime((vol || 0.3) * masterVol, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (dur || 0.15));
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + (dur || 0.15) + 0.01);
  }

  function noise(dur, vol, hipass) {
    if (!ctx || !enabled) return;
    if (ctx.state === 'suspended') ctx.resume();
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime((vol || 0.2) * masterVol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    if (hipass) {
      var filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = hipass;
      src.connect(filter); filter.connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(ctx.destination);
    src.start(); src.stop(ctx.currentTime + dur);
  }

  // ── Trilha procedural de combate ──────────────────────────
  // OPT: em vez de setInterval criando novos OscillatorNode/GainNode a cada beat
  // (que vaza memória no RPi), agenda os nós com antecedência usando
  // ctx.currentTime e um único setTimeout de controle de loop.
  function startProceduralMusic() {
    if (!ctx || !enabled) return;
    if (ctx.state === 'suspended') ctx.resume();

    var bpm = 145;
    var beat = 60 / bpm;       // segundos por beat
    var stepDur = beat / 2;    // 8 steps por compasso de 4 tempos

    var drumPattern = [
      [true, false, true],
      [false, false, true],
      [false, true,  true],
      [false, false, true],
      [true, false,  true],
      [false, false, true],
      [false, true,  true],
      [false, false, true],
    ];
    var bassNotes = [110, 110, 138.6, 110, 164.8, 146.8, 130.8, 110];
    var melNotes  = [220, 261.6, 293.7, 329.6, 392, 349.2, 293.7, 261.6];

    var scheduleAhead = 0.12; // segundos de antecedência
    var nextTime = ctx.currentTime + 0.05;
    var drumStep = 0;
    var bassStep = 0;

    function scheduleStep() {
      if (!musicPlaying || !enabled) return;

      // ── Agendar próximo step enquanto estiver dentro da janela ──
      while (nextTime < ctx.currentTime + scheduleAhead) {
        var t0 = nextTime;

        // Kick
        var step = drumPattern[drumStep % drumPattern.length];
        if (step[0]) {
          var osc = ctx.createOscillator();
          var g   = ctx.createGain();
          osc.frequency.setValueAtTime(160, t0);
          osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.12);
          g.gain.setValueAtTime(0.45 * masterVol, t0);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
          osc.connect(g); g.connect(ctx.destination);
          osc.start(t0); osc.stop(t0 + 0.2);
        }
        // Snare
        if (step[1]) {
          var sLen = Math.floor(ctx.sampleRate * 0.12);
          var sBuf = ctx.createBuffer(1, sLen, ctx.sampleRate);
          var sData = sBuf.getChannelData(0);
          for (var si = 0; si < sLen; si++) sData[si] = Math.random() * 2 - 1;
          var sSrc = ctx.createBufferSource(); sSrc.buffer = sBuf;
          var sGain = ctx.createGain(); var sFilter = ctx.createBiquadFilter();
          sFilter.type = 'highpass'; sFilter.frequency.value = 1200;
          sGain.gain.setValueAtTime(0.28 * masterVol, t0);
          sGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
          sSrc.connect(sFilter); sFilter.connect(sGain); sGain.connect(ctx.destination);
          sSrc.start(t0); sSrc.stop(t0 + 0.13);
        }
        // Hihat
        if (step[2]) {
          var hLen = Math.floor(ctx.sampleRate * 0.04);
          var hBuf = ctx.createBuffer(1, hLen, ctx.sampleRate);
          var hData = hBuf.getChannelData(0);
          for (var hi = 0; hi < hLen; hi++) hData[hi] = Math.random() * 2 - 1;
          var hSrc = ctx.createBufferSource(); hSrc.buffer = hBuf;
          var hGain = ctx.createGain(); var hFilter = ctx.createBiquadFilter();
          hFilter.type = 'highpass'; hFilter.frequency.value = 6000;
          hGain.gain.setValueAtTime(0.10 * masterVol, t0);
          hGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.04);
          hSrc.connect(hFilter); hFilter.connect(hGain); hGain.connect(ctx.destination);
          hSrc.start(t0); hSrc.stop(t0 + 0.05);
        }

        // Baixo (1 por beat completo = a cada 2 steps)
        if (drumStep % 2 === 0) {
          var freq = bassNotes[(bassStep) % bassNotes.length];
          var bOsc = ctx.createOscillator(); var bGain = ctx.createGain();
          var bFilt = ctx.createBiquadFilter();
          bOsc.type = 'sawtooth';
          bOsc.frequency.setValueAtTime(freq, t0);
          bFilt.type = 'lowpass'; bFilt.frequency.value = 600;
          bGain.gain.setValueAtTime(0.18 * masterVol, t0);
          bGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
          bOsc.connect(bFilt); bFilt.connect(bGain); bGain.connect(ctx.destination);
          bOsc.start(t0); bOsc.stop(t0 + 0.25);

          // Melodia (a cada 4 steps)
          if (drumStep % 4 === 0) {
            var mFreq = melNotes[(bassStep / 2 | 0) % melNotes.length];
            var mOsc = ctx.createOscillator(); var mGain = ctx.createGain();
            mOsc.type = 'square';
            mOsc.frequency.setValueAtTime(mFreq, t0);
            mGain.gain.setValueAtTime(0, t0);
            mGain.gain.linearRampToValueAtTime(0.09 * masterVol, t0 + 0.005);
            mGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
            mOsc.connect(mGain); mGain.connect(ctx.destination);
            mOsc.start(t0); mOsc.stop(t0 + 0.19);
          }
          bassStep++;
        }

        drumStep++;
        nextTime += stepDur;
      }

      // Agenda próxima verificação (25ms — bem abaixo do stepDur de ~207ms a 145bpm)
      drumTimer = setTimeout(scheduleStep, 25);
    }

    scheduleStep();
  }

  function stopProceduralMusic() {
    if (drumTimer)   { clearTimeout(drumTimer);   drumTimer   = null; }
    if (melodyTimer) { clearTimeout(melodyTimer);  melodyTimer = null; }
  }

  // ── API pública de sons ────────────────────────────────────
  return {
    init: init,
    loadFile: loadFile,
    setVolume: function (v) { masterVol = Math.max(0, Math.min(1, v)); },
    toggle: function () { enabled = !enabled; },

    // ── Música de combate ────────────────────────────────────
    startFightMusic: function () {
      if (!ctx || !enabled || musicPlaying) return;
      if (ctx.state === 'suspended') ctx.resume();
      musicPlaying = true;

      // Tenta arquivo real primeiro: sounds/fight_music.ogg ou .mp3 ou .wav
      if (buffers['fight_music']) {
        musicGain = ctx.createGain();
        musicGain.gain.value = 0.38 * masterVol;
        musicNode = ctx.createBufferSource();
        musicNode.buffer = buffers['fight_music'];
        musicNode.loop = true;
        musicNode.connect(musicGain);
        musicGain.connect(ctx.destination);
        musicNode.start();
        console.log('[SFX] Música de combate: arquivo');
      } else {
        // Fallback: síntese procedural
        startProceduralMusic();
        console.log('[SFX] Música de combate: procedural');
      }
    },

    stopFightMusic: function () {
      musicPlaying = false;
      // Para arquivo
      if (musicNode) {
        try {
          musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
          musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6); // fade out
          var nodeRef = musicNode;
          setTimeout(function () { try { nodeRef.stop(); } catch (e) { } }, 700);
        } catch (e) { }
        musicNode = null; musicGain = null;
      }
      // Para procedural
      stopProceduralMusic();
    },
    startMenuMusic: function () {
      if (!ctx || !enabled || musicPlaying) return;
      if (ctx.state === 'suspended') ctx.resume();
      musicPlaying = true;

      if (buffers['menu_music']) {
        // Arquivo real: sounds/menu_music.ogg
        musicGain = ctx.createGain();
        musicGain.gain.value = 0.28 * masterVol;
        musicNode = ctx.createBufferSource();
        musicNode.buffer = buffers['menu_music'];
        musicNode.loop = true;
        musicNode.connect(musicGain);
        musicGain.connect(ctx.destination);
        musicNode.start();
        console.log('[SFX] Música de menu: arquivo');
      } else {
        // OPT: menu music usa agendamento por ctx.currentTime (sem setInterval vazando nós)
        var bpm90 = 90;
        var beat90 = 60 / bpm90;
        var melNotes90 = [220, 261.6, 293.7, 261.6, 220, 196, 220, 246.9];
        var step90 = 0;
        var nextT90 = ctx.currentTime + 0.05;
        var ahead90 = 0.15;

        function scheduleMenu() {
          if (!musicPlaying || !enabled) return;
          while (nextT90 < ctx.currentTime + ahead90) {
            var t0 = nextT90;
            var freq90 = melNotes90[step90 % melNotes90.length];
            // triângulo suave
            var mOsc = ctx.createOscillator(); var mGain = ctx.createGain();
            mOsc.type = 'triangle';
            mOsc.frequency.setValueAtTime(freq90, t0);
            mGain.gain.setValueAtTime(0, t0);
            mGain.gain.linearRampToValueAtTime(0.07 * masterVol, t0 + 0.01);
            mGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
            mOsc.connect(mGain); mGain.connect(ctx.destination);
            mOsc.start(t0); mOsc.stop(t0 + 0.36);
            // hihat suave a cada 4
            if (step90 % 4 === 0) {
              var hLen = Math.floor(ctx.sampleRate * 0.06);
              var hBuf = ctx.createBuffer(1, hLen, ctx.sampleRate);
              var hD = hBuf.getChannelData(0);
              for (var hi = 0; hi < hLen; hi++) hD[hi] = Math.random() * 2 - 1;
              var hSrc = ctx.createBufferSource(); hSrc.buffer = hBuf;
              var hGain = ctx.createGain(); var hFilt = ctx.createBiquadFilter();
              hFilt.type = 'highpass'; hFilt.frequency.value = 3000;
              hGain.gain.setValueAtTime(0.06 * masterVol, t0);
              hGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
              hSrc.connect(hFilt); hFilt.connect(hGain); hGain.connect(ctx.destination);
              hSrc.start(t0); hSrc.stop(t0 + 0.07);
            }
            step90++;
            nextT90 += beat90;
          }
          melodyTimer = setTimeout(scheduleMenu, 25);
        }
        scheduleMenu();
        console.log('[SFX] Música de menu: procedural');
      }
    },

    stopMenuMusic: function () {
      musicPlaying = false;
      if (musicNode) {
        try {
          musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
          musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
          var nodeRef = musicNode;
          setTimeout(function () { try { nodeRef.stop(); } catch (e) { } }, 900);
        } catch (e) { }
        musicNode = null; musicGain = null;
      }
      stopProceduralMusic();
    },
    // Menus
    menuMove: function () {
      if (buffers['menu_move']) { playBuffer('menu_move', 0.5); return; }
      synth('square', 440, 0.06, 0.18);
    },
    menuConfirm: function () {
      if (buffers['menu_confirm']) { playBuffer('menu_confirm', 0.7); return; }
      synth('square', 660, 0.05, 0.25);
      setTimeout(function () { synth('square', 880, 0.08, 0.22); }, 55);
    },
    menuBack: function () {
      if (buffers['menu_back']) { playBuffer('menu_back', 0.5); return; }
      synth('square', 330, 0.08, 0.2);
      setTimeout(function () { synth('square', 220, 0.10, 0.18); }, 60);
    },
    charSelect: function () {
      if (buffers['menu_move']) { playBuffer('menu_move', 0.4); return; }
      synth('triangle', 550, 0.07, 0.15);
    },
    charConfirm: function () {
      if (buffers['menu_confirm']) { playBuffer('menu_confirm', 0.8); return; }
      synth('square', 880, 0.04, 0.28);
      setTimeout(function () { synth('square', 1100, 0.06, 0.25); }, 40);
      setTimeout(function () { synth('square', 1320, 0.10, 0.22); }, 90);
    },

    // Combate
    hit: function () {
      if (buffers['fight_hit']) { playBuffer('fight_hit', 1.0); return; }
      noise(0.08, 0.35, 800);
      synth('sawtooth', 180, 0.10, 0.28);
    },
    block: function () {
      if (buffers['fight_block']) { playBuffer('fight_block', 0.8); return; }
      synth('square', 300, 0.05, 0.2);
      noise(0.04, 0.15, 2000);
    },
    crit: function () {
      if (buffers['fight_crit']) { playBuffer('fight_crit', 1.0); return; }
      noise(0.12, 0.5, 400);
      synth('sawtooth', 120, 0.15, 0.4);
      setTimeout(function () { synth('square', 80, 0.12, 0.35); }, 30);
    },
    dead: function () {
      if (buffers['fight_dead']) { playBuffer('fight_dead', 1.0); return; }
      synth('sawtooth', 200, 0.05, 0.3);
      setTimeout(function () { synth('sawtooth', 140, 0.08, 0.28); }, 60);
      setTimeout(function () { synth('sawtooth', 90, 0.20, 0.25); }, 130);
    },
    roundStart: function () {
      if (buffers['round_start']) { playBuffer('round_start', 1.0); return; }
      synth('square', 440, 0.08, 0.3);
      setTimeout(function () { synth('square', 550, 0.08, 0.3); }, 90);
      setTimeout(function () { synth('square', 880, 0.18, 0.4); }, 180);
    },
    roundWin: function () {
      if (buffers['round_win']) { playBuffer('round_win', 1.0); return; }
      [440, 550, 660, 880, 1100].forEach(function (f, i) {
        setTimeout(function () { synth('square', f, 0.12, 0.3); }, i * 80);
      });
    },
  };
})();

// ── Animações ───────────────────────────────────────────────────
// ANIM_DEFAULTS: fps e loop globais. frames vem de cada personagem em CHARS.
const ANIM_DEFAULTS = {
  Idle: { fps: 6, loop: true },
  Walk: { fps: 10, loop: true },
  Run: { fps: 12, loop: true },
  Jump: { fps: 10, loop: false },
  Attack_1: { fps: 14, loop: false },
  Attack_2: { fps: 14, loop: false },
  Attack_3: { fps: 14, loop: false },
  Hurt: { fps: 10, loop: false },
  Dead: { fps: 8, loop: false },
  Shield: { fps: 6, loop: true },
};

// ANIM mantido como fallback (frames=1) para qualquer código legado
const ANIM = (function () {
  var o = {};
  Object.keys(ANIM_DEFAULTS).forEach(function (k) {
    o[k] = Object.assign({ frames: 1 }, ANIM_DEFAULTS[k]);
  });
  return o;
})();

const STATE_TO_ANIM = {
  IDLE: 'Idle', WALK: 'Walk', RUN: 'Run', JUMP: 'Jump',
  ATTACK_1: 'Attack_1', ATTACK_2: 'Attack_2', ATTACK_3: 'Attack_3',
  HURT: 'Hurt', DEAD: 'Dead', SHIELD: 'Shield',
};

// Retorna a definição de animação mesclada para um fighter específico.
// frames  → charData.anim[animName]  (quantidade real de frames no PNG)
// fps/loop → ANIM_DEFAULTS           (comportamento global)
function getAnim(fighter, animName) {
  var defaults = ANIM_DEFAULTS[animName] || ANIM_DEFAULTS['Idle'];
  var charFrames = (fighter && fighter.charData && fighter.charData.anim &&
    fighter.charData.anim[animName] !== undefined)
    ? fighter.charData.anim[animName]
    : 1;
  return { frames: charFrames, fps: defaults.fps, loop: defaults.loop };
}

// ── Gamepad ─────────────────────────────────────────────────────
// Knup KP-3124: indices variam por driver/OS.
// gpConfirm() testa botoes 0,1,2,3,9 para garantir compatibilidade.
// Use Tab no jogo para abrir o debug de gamepad e ver os indices reais.
const PAD = {
  A: 0, B: 1, X: 2, Y: 3,
  SELECT: 8, START: 9,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
  AXIS_X: 0, AXIS_Y: 1,
  HAT_X: 6, HAT_Y: 7,
};

// ── Personagens ─────────────────────────────────────────────────
// portrait: imagem exibida na tela de seleção (lado esquerdo/direito)
// Caminho: sprites/character_N/portrait.png  (ou portrait.jpg)
// Se o arquivo não existir, usa o placeholder geométrico (csDrawCharArt)
//
// anim: quantidade de frames de cada animação para ESTE personagem.
// Ajuste os números abaixo conforme os PNGs reais de cada character.
const CHARS = [
  {
    id: 0, name: 'RAVEN', folder: 'character_1', col: [170, 40, 220], acc: [255, 120, 255], elem: 'SOMBRA',
    anim: { Idle: 6, Walk: 8, Run: 8, Jump: 12, Attack_1: 5, Attack_2: 3, Attack_3: 4, Hurt: 2, Dead: 4, Shield: 4 }
  },
  {
    id: 1, name: 'STRIKER', folder: 'character_2', col: [30, 100, 255], acc: [80, 200, 255], elem: 'RELAMPAGO',
    anim: { Idle: 6, Walk: 8, Run: 8, Jump: 12, Attack_1: 6, Attack_2: 4, Attack_3: 3, Hurt: 2, Dead: 3, Shield: 2 }
  },
  {
    id: 2, name: 'BLAZE', folder: 'character_3', col: [255, 70, 10], acc: [255, 210, 30], elem: 'FOGO',
    anim: { Idle: 6, Walk: 8, Run: 8, Jump: 10, Attack_1: 4, Attack_2: 3, Attack_3: 4, Hurt: 3, Dead: 3, Shield: 2 }
  }
];

// Portraits carregados dinamicamente — preenchido no preload
var portraits = {}; // portraits['character_1'] = p5.Image | null

// ── Cenarios ────────────────────────────────────────────────────
const STAGES = [
  { id: 0, name: 'TEMPLO DAS SOMBRAS', sky1: [8, 2, 20], sky2: [40, 10, 80], ground: [50, 15, 70], fog: [90, 20, 140], accent: [200, 60, 255] },
  { id: 1, name: 'ARENA DO CAOS', sky1: [15, 2, 2], sky2: [60, 10, 5], ground: [80, 15, 5], fog: [180, 30, 10], accent: [255, 80, 20] },
  { id: 2, name: 'RUINAS GELADAS', sky1: [2, 10, 25], sky2: [10, 40, 100], ground: [15, 35, 90], fog: [40, 120, 220], accent: [60, 180, 255] },
  { id: 3, name: 'VULCAO DA MORTE', sky1: [20, 4, 0], sky2: [80, 20, 0], ground: [100, 25, 0], fog: [220, 80, 0], accent: [255, 120, 0] },
];

// ── Estado global ───────────────────────────────────────────────
let STATE = 'LOADING';
let sprites = {};
let loadedCount = 0, totalAssets = 0, assetsReady = false;

let p1CharIdx = 0, p2CharIdx = 3;
let p1Ready = false, p2Ready = false;
let stageIdx = 0, selectedStage = null;
let fighter1, fighter2;

let roundTimer = 99, roundTimerRaw = 0;
let roundOver = false, roundWinner = null, roundOverTimer = 0;
let hitEffects = [], screenShake = 0;
let particles = [];

let menuCursor = 0;
const MENU_ITEMS = ['INICIAR JOGO', 'SAIR'];

// Cooldowns de input
let cd = { menu: 0, p1: 0, p2: 0, stage: 0 };

// Loading
let loadProg = 0, loadDots = 0, loadTimer = 0, introTimer = 0;

// Debug gamepad
let showPadDebug = false;

// ── OPT: Cache de gradientes (evita recriar objetos a cada frame) ──
var _gradCache = {};
// ── OPT: Cache de estrelas procedurais por stage (array pré-calculado) ──
var _starCache = {}; // _starCache[stageId] = [{x,y,blink_base}]
// ── OPT: Offscreen canvas para o fundo do menu (estático, renderizado 1x) ──
var _menuBGCanvas = null;
// ── OPT: frameRate reduzido em menus (30 fps) e máximo em luta (60 fps) ──
var _lastFightState = null;

// ── Efeitos de ambiente da arena ────────────────────────────────
// lightning: raio ativo (null = nenhum)
// thunder  : contador de frames do flash de trovão
// embers   : brasas/faíscas flutuantes (Vulcão)
// iceShards: cristais caindo (Ruínas)
var _amb = {
  lightningTimer: 0,   // frames até próximo raio
  lightning: null,     // { x1,y1, segs:[{x,y}], life, maxLife, col }
  thunderFlash: 0,     // frames de clarão branco no céu
  embers: [],          // partículas de brasa (stage VULCAO)
  iceShards: [],       // cristais de gelo caindo (stage RUINAS)
  smokeParticles: [],  // fumaça rasteira (stage TEMPLO)
};

// ── Efeitos especiais de combo ───────────────────────────────────
// comboFX: lista de efeitos visuais ativos disparados por combo
var _comboFX = [];  // { type, x, y, life, maxLife, col, combo, playerNum }

// ── P5 Sketch ───────────────────────────────────────────────────
new p5(function (p) {

  // ── preload ──────────────────────────────────────────────────
  p.preload = function () {
    // Sprites de animação
    Object.keys(ANIM).forEach(function (anim) {
      CHARS.forEach(function (ch) {
        if (!sprites[ch.folder]) sprites[ch.folder] = {};
        totalAssets++;
        sprites[ch.folder][anim] = p.loadImage(
          'sprites/' + ch.folder + '/' + anim + '.png',
          function () { loadedCount++; },
          function () { loadedCount++; sprites[ch.folder][anim] = null; }
        );
      });
    });

    // Portraits da tela de seleção
    // Tenta portrait.png; se falhar tenta portrait.jpg; se falhar usa placeholder
    CHARS.forEach(function (ch) {
      totalAssets++;
      portraits[ch.folder] = null; // default: placeholder
      p.loadImage(
        'sprites/' + ch.folder + '/portrait.png',
        function (img) { portraits[ch.folder] = img; loadedCount++; },
        function () {
          // Tenta JPG
          p.loadImage(
            'sprites/' + ch.folder + '/portrait.jpg',
            function (img) { portraits[ch.folder] = img; loadedCount++; },
            function () { portraits[ch.folder] = null; loadedCount++; }
          );
        }
      );
    });
  };

  // ── setup ────────────────────────────────────────────────────
  p.setup = function () {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.background = '#000';
    document.documentElement.style.overflow = 'hidden';

    var cnv = p.createCanvas(CANVAS_W, CANVAS_H);
    cnv.parent(document.body);
    cnv.style('display', 'block');
    cnv.style('position', 'fixed');
    cnv.style('top', '0');
    cnv.style('left', '0');
    cnv.style('width', '100vw');
    cnv.style('height', '100vh');

    p.imageMode(p.CORNER);
    p.textAlign(p.CENTER, p.CENTER);
    p.noSmooth();
    p.frameRate(60);
    // OPT: força pixel density 1 (evita render 2x desnecessário em displays HiDPI/RPi)
    p.pixelDensity(1);

    // Electron kiosk pode redimensionar após o setup — corrige o canvas
    p.windowResized = function () {
      if (IS_ELECTRON) {
        p.resizeCanvas(window.innerWidth, window.innerHeight);
      }
    };

    // Inicializa o sistema de som
    SFX.init();

    // Tenta carregar sons reais da pasta sounds/ (silencioso se não existirem)
    var soundFiles = [
      ['menu_move', 'sounds/menu_move.wav'],
      ['menu_confirm', 'sounds/menu_confirm.wav'],
      ['menu_back', 'sounds/menu_back.wav'],
      ['fight_hit', 'sounds/fight_hit.wav'],
      ['fight_block', 'sounds/fight_block.wav'],
      ['fight_crit', 'sounds/fight_crit.wav'],
      ['fight_dead', 'sounds/fight_dead.wav'],
      ['round_start', 'sounds/round_start.wav'],
      ['round_win', 'sounds/round_win.wav'],
      // Trilha de combate — coloque sounds/fight_music.ogg (ou .mp3 / .wav)
      // Se não existir, toca a versão procedural gerada automaticamente
      ['fight_music', 'sounds/fight_music.ogg'],
      ['menu_music', 'sounds/menu_music.ogg']
    ];
    soundFiles.forEach(function (s) { SFX.loadFile(s[0], s[1]); });
  };

  // ── draw ─────────────────────────────────────────────────────
  p.draw = function () {
    if (loadedCount >= totalAssets && !assetsReady) assetsReady = true;

    // OPT: ajusta frameRate por estado — 60fps em luta, 30fps em menus
    if (STATE !== _lastFightState) {
      _lastFightState = STATE;
      p.frameRate(STATE === 'FIGHT' ? 60 : 30);
    }

    try {
      switch (STATE) {
        case 'LOADING': drawLoading(); break;
        case 'MENU': drawMenu(); break;
        case 'CHAR_SELECT': drawCharSelect(); break;
        case 'STAGE_SELECT': drawStageSelect(); break;
        case 'FIGHT': drawFight(); break;
        case 'GAMEOVER': drawGameOver(); break;
      }
    } catch (err) {
      p.push();
      p.fill(0, 0, 0, 230); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H);
      p.fill(255, 60, 60); p.textFont('monospace'); p.textSize(14);
      p.textAlign(p.CENTER, p.CENTER);
      p.text('ERRO: ' + String(err).slice(0, 120), CX, CY - 20);
      p.fill(200); p.textSize(11);
      p.text('Pressione R para voltar ao menu', CX, CY + 20);
      p.pop();
      console.error('[SK draw error]', err);
      if (p.keyIsDown(82)) { STATE = 'MENU'; cd.menu = 30; }
    }

    // Sempre rodam — mesmo com erro no estado
    checkGlobalQuit();
    drawFPSOverlay();
    if (showPadDebug) drawPadDebug();
  };

  // ════════════════════════════════════════════════════════════
  //  LOADING  —  estilo MK11: preto + ouro + linhas finas
  // ════════════════════════════════════════════════════════════
  function drawLoading() {
    loadTimer++;
    var target = assetsReady ? 100 : (loadedCount / Math.max(totalAssets, 1)) * 88;
    loadProg += (target - loadProg) * 0.04;
    if (assetsReady) loadProg = Math.min(loadProg + 1.2, 100);

    // Fundo preto absoluto
    p.background(0);

    // Linhas de varredura — via drawingContext (1 operação, não loop)
    p.push();
    var ctx = p.drawingContext;
    var scanGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    scanGrad.addColorStop(0, 'rgba(255,255,255,0.025)');
    scanGrad.addColorStop(0.5, 'rgba(255,255,255,0.008)');
    scanGrad.addColorStop(1, 'rgba(255,255,255,0.002)');
    ctx.fillStyle = scanGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    p.pop();

    // Moldura decorativa ouro
    p.push();
    p.stroke(180, 140, 50, 120); p.strokeWeight(1); p.noFill();
    var fx1 = CX - 260, fy1 = CY - 130, fx2 = CX + 260, fy2 = CY + 90, fc = 12;
    p.line(fx1, fy1, fx2, fy1); p.line(fx1, fy2, fx2, fy2);
    p.stroke(180, 140, 50, 200); p.strokeWeight(1.5);
    // Cantos angulares
    p.line(fx1, fy1, fx1 + fc, fy1); p.line(fx1, fy1, fx1, fy1 + fc);
    p.line(fx2, fy1, fx2 - fc, fy1); p.line(fx2, fy1, fx2, fy1 + fc);
    p.line(fx1, fy2, fx1 + fc, fy2); p.line(fx1, fy2, fx1, fy2 - fc);
    p.line(fx2, fy2, fx2 - fc, fy2); p.line(fx2, fy2, fx2, fy2 - fc);
    p.pop();

    // Logo
    p.push();
    p.textFont('monospace'); p.textStyle(p.BOLD);
    p.textAlign(p.CENTER, p.CENTER); p.noStroke();
    p.fill(255); p.textSize(72);
    p.text('DEV', CX, CY - 68);
    p.stroke(180, 140, 50, 160); p.strokeWeight(1);
    p.line(CX - 120, CY - 32, CX + 120, CY - 32);
    p.noStroke(); p.fill(190, 150, 55); p.textSize(28); p.textStyle(p.NORMAL);
    p.text('K  O  M  B  A  T', CX, CY - 14);
    p.fill(70, 70, 70); p.textSize(9);
    p.text('ARCADE  EDITION', CX, CY + 8);
    p.pop();

    // Barra de progresso — 2px, sem loops
    var bw = CANVAS_W * 0.42, bx = CX - bw / 2, by = CY + 44;
    p.push(); p.noStroke();
    p.fill(22); p.rect(bx, by, bw, 2);
    if (loadProg > 0) {
      var fw2 = bw * (loadProg / 100);
      p.fill(180, 140, 50); p.rect(bx, by, fw2, 2);
      p.fill(230, 195, 90); p.ellipse(bx + fw2, by + 1, 5, 5);
    }
    p.fill(100); p.textFont('monospace'); p.textSize(10); p.textAlign(p.CENTER, p.CENTER);
    p.text(Math.floor(loadProg) + '%', CX, by + 16);
    p.pop();

    // Transição
    if (loadProg >= 99.5) {
      introTimer++;
      var fa = Math.min((introTimer - 15) * 10, 255);
      if (fa > 0) { p.fill(0, 0, 0, fa); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H); }
      if (introTimer > 45) { STATE = 'MENU'; menuCursor = 0; cd.menu = 30; SFX.startMenuMusic(); }
    }
  }

  // ════════════════════════════════════════════════════════════
  //  MENU PRINCIPAL  —  MK11: preto + ouro + espaço em branco
  // ════════════════════════════════════════════════════════════
  function drawMenu() {
    cd.menu = Math.max(0, cd.menu - 1);
    p.background(0);
    drawMenuBG();

    var t = p.frameCount;

    // ── Marca lateral esquerda (coluna de acento) ──
    p.push();
    p.fill(180, 140, 50); p.noStroke();
    p.rect(0, 0, 4, CANVAS_H);               // faixa ouro esquerda
    p.rect(CANVAS_W - 4, 0, 4, CANVAS_H);    // faixa ouro direita
    p.pop();

    // ── Logo — posicionado no terço esquerdo, verticalmente centrado ──
    var logoX = CANVAS_W * 0.28;
    var logoY = CY - 30;

    p.push();
    p.textFont('monospace'); p.textAlign(p.CENTER, p.CENTER); p.noStroke();

    // "DEV" — branco, grande
    p.fill(255); p.textStyle(p.BOLD); p.textSize(78);
    p.text('DEV', logoX, logoY - 40);

    // Linha separadora ouro
    p.stroke(180, 140, 50, 200); p.strokeWeight(1); p.noFill();
    p.line(logoX - 130, logoY - 2, logoX + 130, logoY - 2);

    // "KOMBAT" — ouro, espacado
    p.noStroke(); p.fill(190, 150, 55);
    p.textSize(26); p.textStyle(p.NORMAL);
    p.text('K  O  M  B  A  T', logoX, logoY + 18);

    // Edição
    p.fill(55, 55, 55); p.textSize(9);
    p.text('ARCADE  EDITION  —  2024', logoX, logoY + 40);
    p.pop();

    // ── Divisor vertical central ──
    p.push();
    p.stroke(30, 30, 30); p.strokeWeight(1);
    p.line(CANVAS_W * 0.52, CANVAS_H * 0.15, CANVAS_W * 0.52, CANVAS_H * 0.85);
    p.pop();
    // Losango no meio do divisor
    p.push();
    p.stroke(180, 140, 50, 150); p.strokeWeight(1); p.noFill();
    p.translate(CANVAS_W * 0.52, CY); p.rotate(Math.PI / 4);
    p.rect(-5, -5, 10, 10);
    p.pop();

    // ── Itens do menu — lado direito ──
    var menuX = CANVAS_W * 0.72;
    for (var i = 0; i < MENU_ITEMS.length; i++) {
      var my = CY - 10 + i * 62;
      var sel = menuCursor === i;

      p.push();
      p.textAlign(p.LEFT, p.CENTER); p.noStroke();

      if (sel) {
        // Faixa de seleção: linha ouro à esquerda + texto branco
        p.fill(180, 140, 50); p.rect(menuX - 30, my - 20, 3, 40);
        p.fill(255); p.textFont('monospace'); p.textStyle(p.BOLD); p.textSize(22);
        p.text(MENU_ITEMS[i], menuX - 18, my);

        // Sublinhado animado — expande
        var lineW = p.map(Math.abs(Math.sin(t * 0.06)), 0, 1, 60, 160);
        p.stroke(180, 140, 50, 180); p.strokeWeight(1);
        p.line(menuX - 18, my + 17, menuX - 18 + lineW, my + 17);

        // Indicador numérico à direita (estilo arcade)
        p.noStroke(); p.fill(50, 50, 50);
        p.textSize(9); p.textAlign(p.RIGHT, p.CENTER);
        p.text('0' + (i + 1), menuX + 180, my);
      } else {
        p.fill(55); p.textFont('monospace'); p.textStyle(p.NORMAL);
        p.textSize(20); p.textAlign(p.LEFT, p.CENTER);
        p.text(MENU_ITEMS[i], menuX - 18, my);
        // Indicador numérico
        p.fill(35); p.textSize(9); p.textAlign(p.RIGHT, p.CENTER);
        p.text('0' + (i + 1), menuX + 180, my);
      }
      p.pop();
    }

    // ── Hint de controles — rodapé limpo ──
    p.push();
    p.stroke(20, 20, 20); p.strokeWeight(1);
    p.line(0, CANVAS_H - 34, CANVAS_W, CANVAS_H - 34);
    p.noStroke(); p.fill(38); p.textFont('monospace'); p.textSize(9);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('CIMA / BAIXO  —  MOVER      A / START  —  CONFIRMAR      SELECT+START  —  SAIR', CX, CANVAS_H - 17);
    if (IS_ELECTRON) {
      p.fill(180, 140, 50, 100); p.textAlign(p.RIGHT, p.CENTER);
      p.text('KIOSK', CANVAS_W - 16, CANVAS_H - 17);
    }
    p.pop();

    // ── Input ──
    if (cd.menu > 0) return;
    var gp = gpAny();
    var up = p.keyIsDown(38) || gpUp(gp);
    var down = p.keyIsDown(40) || gpDown(gp);
    var conf = p.keyIsDown(13) || p.keyIsDown(90) || gpConfirm(gp);

    if (up) { menuCursor = (menuCursor - 1 + MENU_ITEMS.length) % MENU_ITEMS.length; cd.menu = 15; SFX.menuMove(); }
    if (down) { menuCursor = (menuCursor + 1) % MENU_ITEMS.length; cd.menu = 15; SFX.menuMove(); }
    if (conf && cd.menu === 0) {
      cd.menu = 20;
      SFX.menuConfirm();
      if (menuCursor === 0) { resetSelection(); STATE = 'CHAR_SELECT'; }
      else { quitApp(); }
    }
  }

  function drawMenuBG() {
    // OPT: gradientes do menu são estáticos — renderiza 1× num offscreen canvas
    if (!_menuBGCanvas) {
      _menuBGCanvas = document.createElement('canvas');
      _menuBGCanvas.width  = CANVAS_W;
      _menuBGCanvas.height = CANVAS_H;
      var mc = _menuBGCanvas.getContext('2d');
      var topGrad = mc.createLinearGradient(0, 0, 0, 100);
      topGrad.addColorStop(0, 'rgba(0,0,0,0.12)');
      topGrad.addColorStop(1, 'rgba(0,0,0,0)');
      mc.fillStyle = topGrad; mc.fillRect(0, 0, CANVAS_W, 100);
      var botGrad = mc.createLinearGradient(0, CANVAS_H - 100, 0, CANVAS_H);
      botGrad.addColorStop(0, 'rgba(0,0,0,0)');
      botGrad.addColorStop(1, 'rgba(0,0,0,0.12)');
      mc.fillStyle = botGrad; mc.fillRect(0, CANVAS_H - 100, CANVAS_W, 100);
      var radGrad = mc.createRadialGradient(CANVAS_W * 0.28, CY, 0, CANVAS_W * 0.28, CY, 340);
      radGrad.addColorStop(0, 'rgba(180,140,50,0.04)');
      radGrad.addColorStop(1, 'rgba(0,0,0,0)');
      mc.fillStyle = radGrad; mc.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    p.drawingContext.drawImage(_menuBGCanvas, 0, 0);
  }

  function safeIdx(i) { return ((i % CHARS.length) + CHARS.length) % CHARS.length; }

  function resetSelection() {
    p1CharIdx = 0;
    p2CharIdx = Math.min(3, CHARS.length - 1); // seguro mesmo se CHARS tiver menos de 4
    p1Ready = false; p2Ready = false;
    cd.p1 = 25; cd.p2 = 25;
  }

  // ════════════════════════════════════════════════════════════
  //  SELECAO DE PERSONAGEM
  // ════════════════════════════════════════════════════════════
  //  SELECAO DE PERSONAGEM  —  MK11 fiel
  //  Personagens ocupam os lados inteiros como arte de fundo.
  //  Grade pequena e dourada no centro. Barra "P1 VS P2" embaixo.
  // ════════════════════════════════════════════════════════════
  function drawCharSelect() {
    cd.p1 = Math.max(0, cd.p1 - 1);
    cd.p2 = Math.max(0, cd.p2 - 1);

    var ctx = p.drawingContext;
    var t = p.frameCount;
    var COLS = 3;

    var p1ch = CHARS[safeIdx(p1CharIdx)];
    var p2ch = CHARS[safeIdx(p2CharIdx)];

    // ── 1. Fundo preto absoluto ───────────────────────────────
    p.background(0);

    // ── 2. Arte de fundo P1 — lado esquerdo, tela inteira ────
    csDrawCharArt(p1ch, 0, 0, CANVAS_W * 0.5, CANVAS_H, true, t);

    // ── 3. Arte de fundo P2 — lado direito, tela inteira ─────
    csDrawCharArt(p2ch, CANVAS_W * 0.5, 0, CANVAS_W * 0.5, CANVAS_H, false, t);

    // ── 4. Vinheta central — escurece o centro atrás da grade ─
    var vigW = CANVAS_W * 0.44;
    var vigX = CX - vigW / 2;
    var vL = ctx.createLinearGradient(vigX, 0, vigX + vigW, 0);
    vL.addColorStop(0, 'rgba(0,0,0,0.0)');
    vL.addColorStop(0.2, 'rgba(0,0,0,0.85)');
    vL.addColorStop(0.8, 'rgba(0,0,0,0.85)');
    vL.addColorStop(1, 'rgba(0,0,0,0.0)');
    ctx.fillStyle = vL;
    ctx.fillRect(vigX, 0, vigW, CANVAS_H);

    // ── 5. Linha divisória central dourada ────────────────────
    p.push();
    p.stroke(180, 140, 50, 60); p.strokeWeight(1);
    p.line(CX, 0, CX, CANVAS_H);
    p.pop();

    // ── 6. Título ─────────────────────────────────────────────
    p.push();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, CANVAS_W, 38);
    p.stroke(180, 140, 50, 60); p.strokeWeight(1);
    p.line(0, 38, CANVAS_W, 38);
    p.noStroke(); p.fill(190, 155, 60);
    p.textFont('monospace'); p.textStyle(p.BOLD); p.textSize(11);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('S E L E C A O   D E   L U T A D O R', CX, 19);
    p.pop();

    // ── 7. Grade de personagens (centro) ──────────────────────
    var THUMB = 82;         // tamanho de cada célula
    var GAP = 3;          // espaço entre células
    var GCOLS = 3, GROWS = 2;
    var GW = GCOLS * (THUMB + GAP) - GAP;
    var GH = GROWS * (THUMB + GAP) - GAP;
    var GX = CX - GW / 2;
    var GY = CANVAS_H * 0.5 - GH / 2 - 14;

    // Moldura externa da grade — dourada
    p.push();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(GX - 10, GY - 10, GW + 20, GH + 20);
    p.noFill(); p.stroke(180, 140, 50, 140); p.strokeWeight(1.5);
    p.rect(GX - 10, GY - 10, GW + 20, GH + 20);
    // Cantos da moldura
    var mc = 8;
    p.stroke(220, 185, 70, 220); p.strokeWeight(2);
    // TL
    p.line(GX - 10, GY - 10, GX - 10 + mc, GY - 10); p.line(GX - 10, GY - 10, GX - 10, GY - 10 + mc);
    // TR
    p.line(GX - 10 + GW + 20, GY - 10, GX - 10 + GW + 20 - mc, GY - 10); p.line(GX - 10 + GW + 20, GY - 10, GX - 10 + GW + 20, GY - 10 + mc);
    // BL
    p.line(GX - 10, GY - 10 + GH + 20, GX - 10 + mc, GY - 10 + GH + 20); p.line(GX - 10, GY - 10 + GH + 20, GX - 10, GY - 10 + GH + 20 - mc);
    // BR
    p.line(GX - 10 + GW + 20, GY - 10 + GH + 20, GX - 10 + GW + 20 - mc, GY - 10 + GH + 20); p.line(GX - 10 + GW + 20, GY - 10 + GH + 20, GX - 10 + GW + 20, GY - 10 + GH + 20 - mc);
    p.pop();

    // Células individuais
    for (var i = 0; i < CHARS.length; i++) {
      var gc = i % GCOLS, gr = Math.floor(i / GCOLS);
      var tx = GX + gc * (THUMB + GAP);
      var ty = GY + gr * (THUMB + GAP);
      var ch = CHARS[i];
      if (!ch) continue;

      var isP1 = p1CharIdx === i;
      var isP2 = p2CharIdx === i;
      var isBoth = isP1 && isP2;
      var pulse = Math.abs(Math.sin(t * 0.09));

      p.push();

      // Fundo da célula
      if (isP1 || isP2) {
        ctx.fillStyle = 'rgba(' +
          Math.floor(ch.col[0] * 0.18) + ',' +
          Math.floor(ch.col[1] * 0.18) + ',' +
          Math.floor(ch.col[2] * 0.18) + ',1)';
      } else {
        ctx.fillStyle = 'rgba(10,8,16,1)';
      }
      ctx.fillRect(tx, ty, THUMB, THUMB);

      // Borda da célula
      p.noFill();
      if (isBoth) {
        // Ouro pulsante
        p.stroke(220, 185 + pulse * 35, 60); p.strokeWeight(2 + pulse);
      } else if (isP1) {
        p.stroke(60, 130, 255); p.strokeWeight(2 + pulse * 0.8);
      } else if (isP2) {
        p.stroke(255, 55, 30); p.strokeWeight(2 + pulse * 0.8);
      } else {
        p.stroke(35, 28, 50); p.strokeWeight(1);
      }
      p.rect(tx, ty, THUMB, THUMB);

      // Marcador de cursor — triângulo no canto
      if (isP1 && !isBoth) {
        p.fill(60, 130, 255); p.noStroke();
        p.triangle(tx, ty, tx + 14, ty, tx, ty + 14);
      }
      if (isP2 && !isBoth) {
        p.fill(255, 55, 30); p.noStroke();
        p.triangle(tx + THUMB, ty, tx + THUMB - 14, ty, tx + THUMB, ty + 14);
      }
      if (isBoth) {
        p.fill(220, 185, 60); p.noStroke();
        p.triangle(tx, ty, tx + 10, ty, tx, ty + 10);
        p.triangle(tx + THUMB, ty, tx + THUMB - 10, ty, tx + THUMB, ty + 10);
      }

      p.pop();

      // Figura do personagem dentro da célula — sprite real ou fallback geométrico
      var idleSprite = sprites[ch.folder] && sprites[ch.folder]['Idle'];
      var drawnSprite = false;
      if (idleSprite && idleSprite.width > 10) {
        p.push();
        // Recorta o frame 0 do Idle.png e centraliza na célula
        // O sprite é desenhado ocupando ~80% da altura da célula
        var sprW = THUMB * 0.80;
        var sprH = THUMB * 0.80;
        var sprX = tx + (THUMB - sprW) * 0.5;
        var sprY = ty + (THUMB - sprH) * 0.5 - 4; // leve offset pra cima
        drawnSprite = drawSpriteFrame(idleSprite, 0, FRAME_W, FRAME_H, sprX, sprY, sprW, sprH);
        p.pop();
      }
      if (!drawnSprite) {
        drawCharFigure(ch, tx + THUMB * 0.5, ty + THUMB * 0.48, THUMB * 0.32);
      }

      // Nome
      p.push(); p.noStroke(); p.textFont('monospace'); p.textAlign(p.CENTER, p.CENTER);
      p.fill(isP1 || isP2 ? 230 : 75);
      p.textStyle(isP1 || isP2 ? p.BOLD : p.NORMAL); p.textSize(7);
      p.text(ch.name, tx + THUMB * 0.5, ty + THUMB - 8);
      p.pop();
    }

    // ── 8. Barra VS embaixo da grade — ponto focal visual ─────
    var vsY = GY + GH + 20;
    var vsW = GW + 20;
    var vsX = CX - vsW / 2;
    var vsH = 52;

    p.push();
    // Fundo da barra
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(vsX, vsY, vsW, vsH);
    // Borda ouro superior
    p.stroke(180, 140, 50, 120); p.strokeWeight(1);
    p.line(vsX, vsY, vsX + vsW, vsY);
    // Borda ouro inferior
    p.line(vsX, vsY + vsH, vsX + vsW, vsY + vsH);
    p.noStroke();

    // Nome P1 — alinhado à esquerda da barra
    p.fill(80, 130, 255); p.textFont('monospace'); p.textStyle(p.BOLD); p.textSize(9);
    p.textAlign(p.LEFT, p.CENTER);
    p.text('P1', vsX + 10, vsY + 14);
    p.fill(p1Ready ? p.color(220, 195, 90) : p.color(200));
    p.textSize(14); p.textStyle(p.BOLD);
    p.text(p1ch.name, vsX + 10, vsY + 34);

    // "VS" central — dourado, grande
    p.fill(190, 155, 60); p.textSize(18); p.textStyle(p.BOLD);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('VS', CX, vsY + vsH / 2);

    // Nome P2 — alinhado à direita da barra
    p.fill(255, 80, 50); p.textSize(9); p.textStyle(p.BOLD);
    p.textAlign(p.RIGHT, p.CENTER);
    p.text('P2', vsX + vsW - 10, vsY + 14);
    p.fill(p2Ready ? p.color(220, 195, 90) : p.color(200));
    p.textSize(14); p.textStyle(p.BOLD);
    p.text(p2ch.name, vsX + vsW - 10, vsY + 34);

    // Status de prontidão — ponto colorido
    p.noStroke();
    p.fill(p1Ready ? p.color(0, 200, 80) : p.color(100, 100, 100));
    p.ellipse(vsX + 10 + p.textWidth(p1ch.name) + 10, vsY + 34, 6, 6);
    p.fill(p2Ready ? p.color(0, 200, 80) : p.color(100, 100, 100));
    p.textAlign(p.RIGHT, p.CENTER);
    // Ponto à esquerda do nome P2
    p.ellipse(vsX + vsW - 10 - p.textWidth(p2ch.name) - 10, vsY + 34, 6, 6);
    p.pop();

    // ── 9. Hint de confirmação / avançar ─────────────────────
    var hintY = vsY + vsH + 14;
    p.push(); p.noStroke(); p.textFont('monospace'); p.textAlign(p.CENTER, p.CENTER);
    if (p1Ready && p2Ready) {
      var bp = Math.abs(Math.sin(t * 0.07));
      p.fill(220, 195, 90, 180 + bp * 75); p.textStyle(p.BOLD); p.textSize(10);
      p.text('START  ›  ESCOLHER CENARIO', CX, hintY);
    } else {
      p.fill(55); p.textStyle(p.NORMAL); p.textSize(9);
      p.text('Pressione  A  para confirmar', CX, hintY);
    }
    p.pop();

    // ── 10. Labels de player sobre as artes de fundo ──────────
    // P1 — canto superior esquerdo
    p.push(); p.noStroke();
    p.fill(0, 0, 0, 140); p.rect(0, 38, 90, 28);
    p.fill(60, 120, 255); p.textFont('monospace'); p.textStyle(p.BOLD); p.textSize(8);
    p.textAlign(p.LEFT, p.CENTER); p.text('PLAYER 1', 10, 52);
    // P2 — canto superior direito
    p.fill(0, 0, 0, 140); p.rect(CANVAS_W - 90, 38, 90, 28);
    p.fill(255, 60, 30); p.textAlign(p.RIGHT, p.CENTER);
    p.text('PLAYER 2', CANVAS_W - 10, 52);
    p.pop();

    // Rodapé
    drawFooter('P1: WASD + Z=OK X=Voltar     P2: Setas + ENTER=OK SHIFT=Voltar     Tab=Debug Controle');

    // ── Input P1 ──────────────────────────────────────────────
    if (cd.p1 <= 0) {
      var gp1 = getGamepad(0); var m1 = false;
      if (!p1Ready) {
        if (gpLeft(gp1) || p.keyIsDown(65)) { p1CharIdx = safeIdx(p1CharIdx - 1); m1 = true; SFX.charSelect(); }
        if (gpRight(gp1) || p.keyIsDown(68)) { p1CharIdx = safeIdx(p1CharIdx + 1); m1 = true; SFX.charSelect(); }
        if (gpUp(gp1) || p.keyIsDown(87)) { p1CharIdx = safeIdx(p1CharIdx - COLS); m1 = true; SFX.charSelect(); }
        if (gpDown(gp1) || p.keyIsDown(83)) { p1CharIdx = safeIdx(p1CharIdx + COLS); m1 = true; SFX.charSelect(); }
        p1CharIdx = Math.max(0, Math.min(p1CharIdx, CHARS.length - 1));
      }
      if (gpConfirm(gp1) || p.keyIsDown(90) || p.keyIsDown(32)) {
        if (!p1Ready) { p1Ready = true; m1 = true; SFX.charConfirm(); }
        else if (p2Ready) { STATE = 'STAGE_SELECT'; cd.stage = 25; m1 = true; SFX.menuConfirm(); }
      }
      if (gpCancel(gp1) || p.keyIsDown(88)) {
        if (p1Ready) { p1Ready = false; m1 = true; SFX.menuBack(); }
        else { STATE = 'MENU'; cd.menu = 20; SFX.menuBack(); }
      }
      if (padBtn(gp1, PAD.START) && p1Ready && p2Ready) { STATE = 'STAGE_SELECT'; cd.stage = 25; m1 = true; SFX.menuConfirm(); }
      if (m1) cd.p1 = 12;
    }

    // ── Input P2 ──────────────────────────────────────────────
    if (cd.p2 <= 0) {
      var gp2 = getGamepad(1); var m2 = false;
      if (!p2Ready) {
        if (gpLeft(gp2) || p.keyIsDown(37)) { p2CharIdx = safeIdx(p2CharIdx - 1); m2 = true; SFX.charSelect(); }
        if (gpRight(gp2) || p.keyIsDown(39)) { p2CharIdx = safeIdx(p2CharIdx + 1); m2 = true; SFX.charSelect(); }
        if (gpUp(gp2) || p.keyIsDown(38)) { p2CharIdx = safeIdx(p2CharIdx - COLS); m2 = true; SFX.charSelect(); }
        if (gpDown(gp2) || p.keyIsDown(40)) { p2CharIdx = safeIdx(p2CharIdx + COLS); m2 = true; SFX.charSelect(); }
        p2CharIdx = Math.max(0, Math.min(p2CharIdx, CHARS.length - 1));
      }
      if (gpConfirm(gp2) || p.keyIsDown(13) || p.keyIsDown(76) || p.keyIsDown(108)) {
        if (!p2Ready) { p2Ready = true; m2 = true; SFX.charConfirm(); }
      }
      if (gpCancel(gp2) || p.keyIsDown(16) || p.keyIsDown(75)) {
        if (p2Ready) { p2Ready = false; m2 = true; SFX.menuBack(); }
      }
      if (m2) cd.p2 = 12;
    }
  }

  // ── Arte de fundo de personagem — ocupa metade da tela ──────
  // Se portrait.png existir em sprites/character_N/ usa a imagem real.
  // Caso contrário usa o placeholder geométrico sofisticado.
  function csDrawCharArt(ch, rx, ry, rw, rh, isLeft, t) {
    if (!ch) return;
    var ctx = p.drawingContext;
    var col = ch.col, acc = ch.acc;

    // ── Gradiente de cor do personagem no fundo ──────────────
    var grad;
    if (isLeft) {
      grad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      grad.addColorStop(0, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.28)');
      grad.addColorStop(0.55, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.10)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      grad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.45, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.10)');
      grad.addColorStop(1, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.28)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(rx, ry, rw, rh);

    var portrait = portraits[ch.folder];

    if (portrait && portrait.width > 10) {
      // ── MODO IMAGEM REAL ──────────────────────────────────
      // Escala a imagem para preencher a altura do painel mantendo proporção
      var iw = portrait.width, ih = portrait.height;
      var scale = rh / ih;
      var dw = iw * scale, dh = rh;
      // Centraliza horizontalmente dentro do lado
      var dx = isLeft ? rx + rw * 0.5 - dw * 0.5 : rx + rw * 0.5 - dw * 0.5;

      // Salva o contexto para aplicar clip por lado
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.clip();

      // Desenha imagem com leve deslocamento em direção ao centro
      var offsetX = isLeft ? rw * 0.1 : -rw * 0.1;
      p.push();
      p.imageMode(p.CORNER);
      p.tint(255, 255); // sem tint
      p.image(portrait, dx + offsetX, ry, dw, dh);
      p.noTint();
      p.pop();

      ctx.restore();

      // Gradiente de fade nas bordas (apaga a borda externa)
      var fadeGrad;
      if (isLeft) {
        fadeGrad = ctx.createLinearGradient(rx, 0, rx + rw * 0.22, 0);
        fadeGrad.addColorStop(0, 'rgba(0,0,0,0.95)');
        fadeGrad.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        fadeGrad = ctx.createLinearGradient(rx + rw * 0.78, 0, rx + rw, 0);
        fadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
        fadeGrad.addColorStop(1, 'rgba(0,0,0,0.95)');
      }
      ctx.fillStyle = fadeGrad;
      ctx.fillRect(rx, ry, rw, rh);

      // Gradiente de fade no topo e no fundo (integra com o fundo)
      var topFade = ctx.createLinearGradient(0, ry, 0, ry + rh * 0.18);
      topFade.addColorStop(0, 'rgba(0,0,0,0.85)');
      topFade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = topFade; ctx.fillRect(rx, ry, rw, rh * 0.18);

      var botFade = ctx.createLinearGradient(0, ry + rh * 0.72, 0, ry + rh);
      botFade.addColorStop(0, 'rgba(0,0,0,0)');
      botFade.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = botFade; ctx.fillRect(rx, ry + rh * 0.72, rw, rh * 0.28);

    } else {
      // ── MODO SPRITE (sem portrait — usa frame do Idle.png) ───
      var idleImg = sprites[ch.folder] && sprites[ch.folder]['Idle'];

      if (idleImg && idleImg.width > 10) {
        // ── Frame do spritesheet escalado para ocupar o painel ─
        // Mantém proporção quadrada do frame (FRAME_W × FRAME_H)
        // e escala para preencher ~88% da altura do painel
        var sprH = rh * 0.88;
        var sprW = sprH; // frame é quadrado
        // Posiciona levemente inclinado para o centro (como o portrait)
        var sprOffX = isLeft ? rw * 0.08 : -rw * 0.08;
        var sprX = rx + rw * 0.5 - sprW * 0.5 + sprOffX;
        var sprY = ry + rh * 0.5 - sprH * 0.54; // levemente acima do centro

        // Espelho para P2 (direita): flip horizontal via drawingContext
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();

        if (!isLeft) {
          // Espelha horizontalmente ao redor do centro do sprite
          ctx.translate(sprX + sprW, 0);
          ctx.scale(-1, 1);
          sprX = 0;
        }

        // Recorta frame 0 do spritesheet e desenha escalado
        var rawImg = idleImg.canvas || idleImg.elt || idleImg;
        ctx.drawImage(rawImg, 0, 0, FRAME_W, FRAME_H, sprX, sprY, sprW, sprH);

        ctx.restore();

        // Halo de luz colorida atrás do sprite (igual ao efeito do portrait)
        var haloX = isLeft ? rx + rw * 0.42 : rx + rw * 0.58;
        var haloGrad = ctx.createRadialGradient(haloX, ry + rh * 0.42, 0, haloX, ry + rh * 0.42, rw * 0.55);
        haloGrad.addColorStop(0, 'rgba(' + acc[0] + ',' + acc[1] + ',' + acc[2] + ',0.13)');
        haloGrad.addColorStop(0.5, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.06)');
        haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = haloGrad;
        ctx.fillRect(rx, ry, rw, rh);

      } else {
        // ── MODO PLACEHOLDER GEOMÉTRICO (nenhum asset disponível) ─
        var lightX = isLeft ? rx + rw - 2 : rx + 2;
        var lGrad = ctx.createLinearGradient(lightX - 60, 0, lightX + 60, 0);
        lGrad.addColorStop(0, 'rgba(0,0,0,0)');
        lGrad.addColorStop(0.5, 'rgba(' + acc[0] + ',' + acc[1] + ',' + acc[2] + ',0.06)');
        lGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lGrad; ctx.fillRect(lightX - 60, ry, 120, rh);

        var figCX = isLeft ? rx + rw * 0.42 : rx + rw * 0.58;
        var figCY = rh * 0.52;
        var figH = rh * 0.78;
        var bob = Math.sin(t * 0.04) * (figH * 0.006);

        p.push(); p.noStroke(); p.fill(0, 0, 0, 45);
        p.ellipse(figCX, rh * 0.86 + bob, figH * 0.38, figH * 0.04);
        p.pop();

        p.push();
        p.translate(figCX, figCY + bob);
        if (!isLeft) p.scale(-1, 1);
        p.noStroke();
        var sc = figH / 220.0;

        p.fill(col[0] * 0.65, col[1] * 0.65, col[2] * 0.65);
        p.rect(-28 * sc, 30 * sc, 24 * sc, 62 * sc, 6 * sc); p.rect(6 * sc, 30 * sc, 24 * sc, 62 * sc, 6 * sc);
        p.fill(col[0] * 0.35, col[1] * 0.35, col[2] * 0.35);
        p.rect(-32 * sc, 82 * sc, 30 * sc, 18 * sc, 4 * sc); p.rect(4 * sc, 82 * sc, 30 * sc, 18 * sc, 4 * sc);
        p.fill(col[0] * 0.5, col[1] * 0.5, col[2] * 0.5);
        p.rect(-34 * sc, 18 * sc, 68 * sc, 16 * sc, 3 * sc);
        p.fill(180, 140, 50); p.rect(-8 * sc, 21 * sc, 16 * sc, 10 * sc, 2 * sc);
        p.fill(col[0], col[1], col[2]);
        p.rect(-34 * sc, -26 * sc, 68 * sc, 50 * sc, 8 * sc);
        p.fill(col[0] * 0.55, col[1] * 0.55, col[2] * 0.55);
        p.rect(-18 * sc, -18 * sc, 36 * sc, 32 * sc, 5 * sc);
        p.fill(acc[0] * 0.6, acc[1] * 0.6, acc[2] * 0.6);
        p.ellipse(0, -4 * sc, 20 * sc, 20 * sc);
        p.fill(col[0] * 0.85, col[1] * 0.85, col[2] * 0.85);
        p.ellipse(-38 * sc, -22 * sc, 28 * sc, 28 * sc); p.ellipse(38 * sc, -22 * sc, 28 * sc, 28 * sc);
        p.fill(180, 140, 50, 160);
        p.ellipse(-38 * sc, -22 * sc, 12 * sc, 12 * sc); p.ellipse(38 * sc, -22 * sc, 12 * sc, 12 * sc);
        p.fill(col[0] * 0.72, col[1] * 0.72, col[2] * 0.72);
        p.rect(-58 * sc, -20 * sc, 22 * sc, 48 * sc, 6 * sc); p.rect(36 * sc, -20 * sc, 22 * sc, 48 * sc, 6 * sc);
        p.fill(acc[0] * 0.65, acc[1] * 0.65, acc[2] * 0.65);
        p.ellipse(-47 * sc, 30 * sc, 24 * sc, 24 * sc); p.ellipse(47 * sc, 30 * sc, 24 * sc, 24 * sc);
        p.fill(acc[0] * 0.75, acc[1] * 0.75, acc[2] * 0.75);
        p.rect(-10 * sc, -40 * sc, 20 * sc, 18 * sc, 3 * sc);
        p.fill(acc[0] * 0.9, acc[1] * 0.9, acc[2] * 0.9);
        p.ellipse(0, -66 * sc, 52 * sc, 56 * sc);
        p.fill(col[0] * 0.28, col[1] * 0.28, col[2] * 0.28);
        p.arc(0, -66 * sc, 52 * sc, 56 * sc, Math.PI, 0);
        p.rect(-26 * sc, -66 * sc, 52 * sc, 14 * sc);
        p.fill(col[0] * 0.15, col[1] * 0.15, col[2] * 0.15);
        p.rect(-20 * sc, -72 * sc, 40 * sc, 20 * sc, 4 * sc);
        p.fill(acc[0], acc[1], acc[2]);
        p.ellipse(-10 * sc, -64 * sc, 10 * sc, 7 * sc); p.ellipse(10 * sc, -64 * sc, 10 * sc, 7 * sc);
        p.fill(255, 255, 255, 180);
        p.ellipse(-8 * sc, -66 * sc, 4 * sc, 3 * sc); p.ellipse(12 * sc, -66 * sc, 4 * sc, 3 * sc);
        var aA = 18 + Math.abs(Math.sin(t * 0.04)) * 14;
        p.noFill();
        p.stroke(acc[0], acc[1], acc[2], aA);
        p.strokeWeight(sc * 8); p.ellipse(0, 0, figH * 0.75, figH * 0.88);
        p.strokeWeight(sc * 3); p.ellipse(0, 0, figH * 0.88, figH * 1.0);
        p.pop();
      }

      // Fade borda externa — comum ao sprite e ao placeholder
      var fadeG;
      if (isLeft) {
        fadeG = ctx.createLinearGradient(rx, 0, rx + rw * 0.28, 0);
        fadeG.addColorStop(0, 'rgba(0,0,0,0.92)'); fadeG.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        fadeG = ctx.createLinearGradient(rx + rw * 0.72, 0, rx + rw, 0);
        fadeG.addColorStop(0, 'rgba(0,0,0,0)'); fadeG.addColorStop(1, 'rgba(0,0,0,0.92)');
      }
      ctx.fillStyle = fadeG; ctx.fillRect(rx, ry, rw, rh);

      // Fade topo e rodapé — integra com a cena
      var topFadeG = ctx.createLinearGradient(0, ry, 0, ry + rh * 0.18);
      topFadeG.addColorStop(0, 'rgba(0,0,0,0.85)');
      topFadeG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = topFadeG; ctx.fillRect(rx, ry, rw, rh * 0.18);

      var botFadeG = ctx.createLinearGradient(0, ry + rh * 0.72, 0, ry + rh);
      botFadeG.addColorStop(0, 'rgba(0,0,0,0)');
      botFadeG.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = botFadeG; ctx.fillRect(rx, ry + rh * 0.72, rw, rh * 0.28);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SELECAO DE CENARIO  —  MK11 style
  //  Layout: Preview em tela cheia + lista lateral + info panel
  //  Suporta imagem real: sprites/stages/stage_N.png | stage_N.jpg
  // ════════════════════════════════════════════════════════════
  function drawStageSelect() {
    cd.stage = Math.max(0, cd.stage - 1);

    var ctx = p.drawingContext;
    var t = p.frameCount;
    var st = STAGES[stageIdx];

    // ── 1. Preview do cenário em tela cheia ──────────────────
    ssDrawStageBG(st, ctx, t);

    // ── 2. Vinheta escura sobre tudo (legibilidade da UI) ────
    // Faixa esquerda — painel de info
    var infoW = CANVAS_W * 0.32;
    var listW = CANVAS_W * 0.22;
    var listX = CANVAS_W - listW;

    var leftVig = ctx.createLinearGradient(0, 0, infoW, 0);
    leftVig.addColorStop(0, 'rgba(0,0,0,0.92)');
    leftVig.addColorStop(0.7, 'rgba(0,0,0,0.80)');
    leftVig.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = leftVig;
    ctx.fillRect(0, 0, infoW, CANVAS_H);

    // Faixa direita — lista de cenários
    var rightVig = ctx.createLinearGradient(listX, 0, CANVAS_W, 0);
    rightVig.addColorStop(0, 'rgba(0,0,0,0)');
    rightVig.addColorStop(0.3, 'rgba(0,0,0,0.88)');
    rightVig.addColorStop(1, 'rgba(0,0,0,0.96)');
    ctx.fillStyle = rightVig;
    ctx.fillRect(listX, 0, listW, CANVAS_H);

    // ── 3. Faixa de título ────────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, CANVAS_W, 42);
    p.push();
    p.stroke(180, 140, 50, 70); p.strokeWeight(1);
    p.line(0, 42, CANVAS_W, 42);
    p.noStroke(); p.fill(190, 155, 60);
    p.textFont(GAME_FONT); p.textStyle(p.BOLD); p.textSize(9);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('S E L E C A O   D E   C E N A R I O', CX, 21);
    p.fill(80); p.textSize(7); p.textStyle(p.NORMAL);
    p.text('Somente P1 navega', CX, 33);
    p.pop();

    // ── 4. Painel de info do cenário (esquerda) ───────────────
    ssDrawInfoPanel(st, infoW, t, ctx);

    // ── 5. Lista de cenários (direita) ────────────────────────
    ssDrawStageList(listX, listW, ctx, t);

    // ── 6. Barra de ação (botão lutar) ────────────────────────
    ssDrawActionBar(ctx, t);

    // ── 7. Rodapé ─────────────────────────────────────────────
    drawFooter('WASD / DIRECIONAL = NAVEGAR     A / START = LUTAR     B = VOLTAR');

    // ── Input ─────────────────────────────────────────────────
    if (cd.stage > 0) return;
    var gp1 = getGamepad(0);

    if (gpUp(gp1) || p.keyIsDown(87) || p.keyIsDown(38)) { stageIdx = (stageIdx - 1 + STAGES.length) % STAGES.length; cd.stage = 14; SFX.menuMove(); }
    if (gpDown(gp1) || p.keyIsDown(83) || p.keyIsDown(40)) { stageIdx = (stageIdx + 1) % STAGES.length; cd.stage = 14; SFX.menuMove(); }
    if (gpLeft(gp1) || p.keyIsDown(65) || p.keyIsDown(37)) { stageIdx = (stageIdx - 1 + STAGES.length) % STAGES.length; cd.stage = 14; SFX.menuMove(); }
    if (gpRight(gp1) || p.keyIsDown(68) || p.keyIsDown(39)) { stageIdx = (stageIdx + 1) % STAGES.length; cd.stage = 14; SFX.menuMove(); }
    if (gpCancel(gp1) || p.keyIsDown(88)) { STATE = 'CHAR_SELECT'; p1Ready = false; p2Ready = false; cd.p1 = 20; cd.p2 = 20; SFX.menuBack(); }
    if (gpConfirm(gp1) || padBtn(gp1, PAD.START) || p.keyIsDown(13) || p.keyIsDown(90)) { SFX.menuConfirm(); startFight(); }
  }

  // ── Preview do cenário em tela cheia ─────────────────────────
  // Tenta carregar sprites/stages/stage_N.png; se não, usa arte procedural
  var stageImages = {}; // stageImages[id] = p5.Image | null | 'loading'

  function ssDrawStageBG(st, ctx, t) {
    // Tenta carregar a imagem do cenário se ainda não tentou
    if (stageImages[st.id] === undefined) {
      stageImages[st.id] = 'loading';
      var imgP5 = p;
      imgP5.loadImage(
        'sprites/stages/stage_' + st.id + '.png',
        function (img) { stageImages[st.id] = img; },
        function () {
          imgP5.loadImage(
            'sprites/stages/stage_' + st.id + '.jpeg',
            function (img) { stageImages[st.id] = img; },
            function () { stageImages[st.id] = null; }
          );
        }
      );
    }

    var img = stageImages[st.id];

    if (img && img !== 'loading' && img.width > 10) {
      // ── Imagem real do cenário ──────────────────────────────
      // Cobre a tela inteira mantendo proporção (cover)
      var iw = img.width, ih = img.height;
      var scaleX = CANVAS_W / iw, scaleY = CANVAS_H / ih;
      var sc = Math.max(scaleX, scaleY);
      var dw = iw * sc, dh = ih * sc;
      var dx = (CANVAS_W - dw) / 2, dy = (CANVAS_H - dh) / 2;

      // Paralaxe sutil: imagem se move levemente
      var px = Math.sin(t * 0.004) * 8;
      var py = Math.cos(t * 0.003) * 5;

      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, CANVAS_W, CANVAS_H); ctx.clip();
      p.push(); p.imageMode(p.CORNER);
      p.image(img, dx + px, dy + py, dw, dh);
      p.pop();
      ctx.restore();

      // Leve escurecimento sobre a imagem para dar contraste à UI
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    } else {
      // ── Arte procedural (sem imagem) ────────────────────────
      p.background(0);

      // Céu — gradiente
      var skyG = ctx.createLinearGradient(0, 0, 0, CANVAS_H * 0.7);
      skyG.addColorStop(0, 'rgb(' + st.sky1[0] + ',' + st.sky1[1] + ',' + st.sky1[2] + ')');
      skyG.addColorStop(1, 'rgb(' + st.sky2[0] + ',' + st.sky2[1] + ',' + st.sky2[2] + ')');
      ctx.fillStyle = skyG; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H * 0.7);

      // Chão
      var groundG = ctx.createLinearGradient(0, CANVAS_H * 0.7, 0, CANVAS_H);
      groundG.addColorStop(0, 'rgb(' + Math.min(255, st.ground[0] * 1.3) + ',' + Math.min(255, st.ground[1] * 1.3) + ',' + Math.min(255, st.ground[2] * 1.3) + ')');
      groundG.addColorStop(1, 'rgb(' + Math.floor(st.ground[0] * 0.3) + ',' + Math.floor(st.ground[1] * 0.3) + ',' + Math.floor(st.ground[2] * 0.3) + ')');
      ctx.fillStyle = groundG; ctx.fillRect(0, CANVAS_H * 0.7, CANVAS_W, CANVAS_H * 0.3);

      // Névoa
      var fogG = ctx.createLinearGradient(0, CANVAS_H * 0.58, 0, CANVAS_H * 0.78);
      fogG.addColorStop(0, 'rgba(' + st.fog[0] + ',' + st.fog[1] + ',' + st.fog[2] + ',0)');
      fogG.addColorStop(0.5, 'rgba(' + st.fog[0] + ',' + st.fog[1] + ',' + st.fog[2] + ',0.35)');
      fogG.addColorStop(1, 'rgba(' + st.fog[0] + ',' + st.fog[1] + ',' + st.fog[2] + ',0)');
      ctx.fillStyle = fogG; ctx.fillRect(0, CANVAS_H * 0.58, CANVAS_W, CANVAS_H * 0.2);

      // Estrelas (determinísticas)
      p.push(); p.noStroke();
      var seed = st.id * 137 + 7;
      for (var s = 0; s < 120; s++) {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        var sx2 = (seed >>> 0) % CANVAS_W;
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        var sy2 = (seed >>> 0) % Math.floor(CANVAS_H * 0.62);
        var blink = s % 4 === 0 ? 0.5 + Math.abs(Math.sin(t * 0.025 + s)) * 0.5 : 0.7;
        p.fill(255, 255, 255, blink * 160);
        p.rect(sx2, sy2, 1, 1);
      }

      // Elementos arquitetônicos simples no horizonte
      var hz = CANVAS_H * 0.68;
      p.fill(st.sky2[0] * 0.5, st.sky2[1] * 0.5, st.sky2[2] * 0.5, 180);
      // Pilares / estruturas no fundo
      for (var pi = 0; pi < 7; pi++) {
        var px2 = CANVAS_W * 0.05 + pi * (CANVAS_W * 0.14);
        var ph = CANVAS_H * (0.08 + (pi % 3) * 0.05);
        p.rect(px2 - 14, hz - ph, 28, ph + 10);
        p.rect(px2 - 20, hz - ph - 8, 40, 10);
      }
      p.pop();

      // Grade de perspectiva no chão
      p.push(); p.stroke(st.fog[0], st.fog[1], st.fog[2], 50); p.strokeWeight(1);
      for (var gi = 0; gi <= 10; gi++) {
        var gx = p.map(gi, 0, 10, 0, CANVAS_W);
        p.line(CX, hz, gx, CANVAS_H);
      }
      for (var gj = 1; gj <= 5; gj++) {
        var gy = hz + (CANVAS_H - hz) * (gj / 5) * (gj / 5);
        p.line(0, gy, CANVAS_W, gy);
      }
      p.pop();
    }
  }

  // ── Painel de info do cenário (lado esquerdo) ─────────────────
  function ssDrawInfoPanel(st, panelW, t, ctx) {
    var padL = 28, infoY = 56;

    // Nome do cenário — grande, em destaque
    p.push();
    p.noStroke(); p.textFont(GAME_FONT); p.textAlign(p.LEFT, p.TOP);

    // Linha decorativa ouro acima do nome
    p.stroke(180, 140, 50, 100); p.strokeWeight(1);
    p.line(padL, infoY, panelW - 20, infoY);
    p.noStroke();

    // Nome
    p.fill(255); p.textStyle(p.BOLD); p.textSize(15);
    // Quebra nome longo em duas linhas se necessário
    var nm = st.name;
    var words = nm.split(' ');
    if (words.length > 2) {
      var mid = Math.ceil(words.length / 2);
      p.text(words.slice(0, mid).join(' '), padL, infoY + 10);
      p.text(words.slice(mid).join(' '), padL, infoY + 32);
      infoY += 58;
    } else {
      p.text(nm, padL, infoY + 10);
      infoY += 36;
    }

    // Linha ouro abaixo do nome
    p.stroke(180, 140, 50, 80); p.strokeWeight(1);
    p.line(padL, infoY + 6, panelW - 20, infoY + 6);
    p.noStroke();
    infoY += 18;

    // Atributos do cenário (gerados a partir dos dados)
    var attrs = [
      { label: 'AMBIENTE', value: ssStageAtmosphere(st) },
      { label: 'PERIGO', value: ssStageDanger(st) },
      { label: 'CLIMA', value: ssStageClimate(st) },
    ];

    attrs.forEach(function (attr) {
      p.fill(180, 140, 50); p.textStyle(p.NORMAL); p.textSize(7);
      p.textAlign(p.LEFT, p.TOP);
      p.text(attr.label, padL, infoY);
      p.fill(220); p.textStyle(p.BOLD); p.textSize(8);
      p.text(attr.value, padL, infoY + 10);
      infoY += 28;
    });

    // Cor do acento do cenário como marca
    infoY += 8;
    p.noStroke(); p.fill(st.accent[0], st.accent[1], st.accent[2], 180);
    p.rect(padL, infoY, 40, 3);
    p.fill(st.accent[0], st.accent[1], st.accent[2], 80);
    p.rect(padL + 44, infoY, 20, 3);

    // Número do cenário — discreto
    infoY += 14;
    p.fill(50); p.textStyle(p.NORMAL); p.textSize(7);
    p.text('ARENA  0' + (st.id + 1), padL, infoY);

    p.pop();
  }

  // ── Lista de miniaturas de cenários (lado direito) ────────────
  function ssDrawStageList(listX, listW, ctx, t) {
    var itemH = (CANVAS_H - 68) / STAGES.length;
    var padX = 12;

    STAGES.forEach(function (st, i) {
      var iy = 46 + i * itemH;
      var iw = listW - padX * 2;
      var ih = itemH - 6;
      var sel = stageIdx === i;
      var pulse = Math.abs(Math.sin(t * 0.08));

      // Fundo da miniatura — mini preview de cor
      var miniSky = ctx.createLinearGradient(0, iy, 0, iy + ih * 0.65);
      miniSky.addColorStop(0, 'rgb(' + st.sky1[0] + ',' + st.sky1[1] + ',' + st.sky1[2] + ')');
      miniSky.addColorStop(1, 'rgb(' + st.sky2[0] + ',' + st.sky2[1] + ',' + st.sky2[2] + ')');
      ctx.fillStyle = miniSky;
      ctx.fillRect(listX + padX, iy, iw, ih * 0.65);

      // Chão da miniatura
      ctx.fillStyle = 'rgb(' + st.ground[0] + ',' + st.ground[1] + ',' + st.ground[2] + ')';
      ctx.fillRect(listX + padX, iy + ih * 0.65, iw, ih * 0.35);

      // Névoa da miniatura
      var miniF = ctx.createLinearGradient(0, iy + ih * 0.5, 0, iy + ih * 0.75);
      miniF.addColorStop(0, 'rgba(' + st.fog[0] + ',' + st.fog[1] + ',' + st.fog[2] + ',0)');
      miniF.addColorStop(0.5, 'rgba(' + st.fog[0] + ',' + st.fog[1] + ',' + st.fog[2] + ',0.4)');
      miniF.addColorStop(1, 'rgba(' + st.fog[0] + ',' + st.fog[1] + ',' + st.fog[2] + ',0)');
      ctx.fillStyle = miniF;
      ctx.fillRect(listX + padX, iy + ih * 0.5, iw, ih * 0.25);

      // Overlay escuro sobre não-selecionados
      if (!sel) {
        ctx.fillStyle = 'rgba(0,0,0,0.52)';
        ctx.fillRect(listX + padX, iy, iw, ih);
      }

      // Borda
      p.push(); p.noFill();
      if (sel) {
        // OPT: sem shadowBlur no item selecionado — usa strokeWeight mais forte
        p.stroke(st.accent[0], st.accent[1], st.accent[2]); p.strokeWeight(2.5 + pulse);
        p.fill(st.accent[0], st.accent[1], st.accent[2]);
        p.noStroke(); p.rect(listX + padX, iy, 3, ih);
      } else {
        p.stroke(35, 28, 50); p.strokeWeight(1);
      }
      p.noFill();
      p.stroke(sel ? p.color(st.accent[0], st.accent[1], st.accent[2]) : p.color(35, 28, 50));
      p.strokeWeight(sel ? 1.5 + pulse : 1);
      p.rect(listX + padX, iy, iw, ih);
      p.pop();

      // Nome na miniatura
      p.push(); p.noStroke(); p.textFont(GAME_FONT);
      p.textAlign(p.LEFT, p.CENTER);
      p.fill(sel ? 255 : 120);
      p.textStyle(sel ? p.BOLD : p.NORMAL);
      p.textSize(sel ? 7 : 6);
      // Sombra de texto para legibilidade
      if (sel) {
        p.fill(0, 0, 0, 100);
        p.text(st.name, listX + padX + 9, iy + ih * 0.5 + 1);
        p.fill(255);
      }
      p.text(st.name, listX + padX + 8, iy + ih * 0.5);

      // "SELECIONADO" — tag abaixo do nome
      if (sel) {
        p.fill(st.accent[0], st.accent[1], st.accent[2], 200);
        p.textSize(6); p.textStyle(p.NORMAL);
        p.text('SELECIONADO', listX + padX + 8, iy + ih * 0.5 + 12);
      }

      // Número da arena
      p.fill(sel ? 180 : 45); p.textSize(6); p.textStyle(p.NORMAL);
      p.textAlign(p.RIGHT, p.CENTER);
      p.text('0' + (i + 1), listX + listW - padX - 4, iy + ih * 0.5);
      p.pop();
    });
  }

  // ── Barra de ação na parte inferior central ───────────────────
  function ssDrawActionBar(ctx, t) {
    var barH = 52;
    var barY = CANVAS_H - barH - 26;

    // Painel central
    var barW = CANVAS_W * 0.38;
    var barX = CX - barW / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(barX, barY, barW, barH);

    // Borda ouro
    var pulse = Math.abs(Math.sin(t * 0.07));
    p.push();
    p.noFill();
    p.stroke(180, 140, 50, 120 + pulse * 60); p.strokeWeight(1.5);
    p.rect(barX, barY, barW, barH);
    // Cantos
    var cc = 8;
    p.stroke(220, 185, 70, 200); p.strokeWeight(2);
    p.line(barX, barY, barX + cc, barY); p.line(barX, barY, barX, barY + cc);
    p.line(barX + barW, barY, barX + barW - cc, barY); p.line(barX + barW, barY, barX + barW, barY + cc);
    p.line(barX, barY + barH, barX + cc, barY + barH); p.line(barX, barY + barH, barX, barY + barH - cc);
    p.line(barX + barW, barY + barH, barX + barW - cc, barY + barH); p.line(barX + barW, barY + barH, barX + barW, barY + barH - cc);

    // Botão "LUTAR"
    p.noStroke(); p.fill(220 + pulse * 20, 185 + pulse * 10, 60);
    p.textFont(GAME_FONT); p.textStyle(p.BOLD); p.textSize(12);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('LUTAR!', CX, barY + barH * 0.38);

    // Hint de controles
    p.fill(80); p.textStyle(p.NORMAL); p.textSize(7);
    p.text('A / START  para confirmar', CX, barY + barH * 0.72);
    p.pop();

    // Tags dos players selecionados
    var p1ch = CHARS[safeIdx(p1CharIdx)];
    var p2ch = CHARS[safeIdx(p2CharIdx)];

    p.push(); p.noStroke(); p.textFont(GAME_FONT);

    // P1 tag — esquerda da barra
    p.fill(0, 0, 0, 160); p.rect(barX - 120, barY, 112, barH);
    p.stroke(60, 120, 255, 140); p.strokeWeight(1); p.noFill();
    p.rect(barX - 120, barY, 112, barH);
    p.noStroke(); p.fill(60, 120, 255); p.textSize(7); p.textStyle(p.BOLD);
    p.textAlign(p.LEFT, p.CENTER); p.text('P1', barX - 112, barY + barH * 0.3);
    p.fill(200); p.textSize(8); p.textStyle(p.BOLD);
    p.text(p1ch ? p1ch.name : '---', barX - 112, barY + barH * 0.62);

    // P2 tag — direita da barra
    p.fill(0, 0, 0, 160); p.noStroke(); p.rect(barX + barW + 8, barY, 112, barH);
    p.stroke(255, 60, 30, 140); p.strokeWeight(1); p.noFill();
    p.rect(barX + barW + 8, barY, 112, barH);
    p.noStroke(); p.fill(255, 60, 30); p.textSize(7); p.textStyle(p.BOLD);
    p.textAlign(p.RIGHT, p.CENTER); p.text('P2', barX + barW + 112, barY + barH * 0.3);
    p.fill(200); p.textSize(8); p.textStyle(p.BOLD);
    p.text(p2ch ? p2ch.name : '---', barX + barW + 112, barY + barH * 0.62);

    // VS entre as tags
    p.fill(190, 155, 60); p.textSize(10); p.textStyle(p.BOLD);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('VS', CX, barY + barH * 0.5 + barH + 6);
    p.pop();
  }

  // ── Helpers de atributos do cenário ───────────────────────────
  function ssStageAtmosphere(st) {
    var avg = (st.sky1[0] + st.sky1[1] + st.sky1[2]) / 3;
    if (avg < 15) return 'SUBTERRANEO';
    if (st.sky1[2] > st.sky1[0] + 10) return 'NOTURNO GELADO';
    if (st.sky1[0] > 30) return 'INFERNAL';
    return 'MISTICO';
  }
  function ssStageDanger(st) {
    var heat = st.fog[0];
    if (heat > 150) return 'EXTREMO !!';
    if (heat > 80) return 'ALTO';
    if (heat > 40) return 'MODERADO';
    return 'BAIXO';
  }
  function ssStageClimate(st) {
    if (st.fog[2] > 150) return 'GLACIAL';
    if (st.fog[0] > 150) return 'VULCANICO';
    if (st.sky2[2] > 60) return 'SOMBRIO';
    return 'TEMPESTUOSO';
  }

  // ════════════════════════════════════════════════════════════
  //  INICIAR LUTA
  // ════════════════════════════════════════════════════════════
  function startFight() {
    selectedStage = STAGES[stageIdx];
    fighter1 = makeFighter(1, CHARS[p1CharIdx], CANVAS_W * 0.22, GROUND_Y);
    fighter2 = makeFighter(2, CHARS[p2CharIdx], CANVAS_W * 0.78, GROUND_Y);
    roundTimer = 99; roundTimerRaw = 0;
    roundOver = false; roundWinner = null; roundOverTimer = 0;
    hitEffects = []; particles = []; screenShake = 0;
    // Reseta efeitos de ambiente e combo
    _amb.lightningTimer = 60;
    _amb.lightning = null;
    _amb.thunderFlash = 0;
    _amb.embers = [];
    _amb.iceShards = [];
    _amb.smokeParticles = [];
    _comboFX = [];
    STATE = 'FIGHT';
    SFX.stopMenuMusic();                                          
    // Som de início de round com pequeno delay (deixa o fade terminar)
    setTimeout(function () { SFX.roundStart(); }, 300);
    // Trilha de combate começa junto com o round
    setTimeout(function () { SFX.startFightMusic(); }, 600);
  }

  // ════════════════════════════════════════════════════════════
  //  FIGHT
  // ════════════════════════════════════════════════════════════
  function drawFight() {
    var sx = 0, sy = 0;
    if (screenShake > 0) {
      sx = p.random(-screenShake, screenShake);
      sy = p.random(-screenShake / 2, screenShake / 2);
      screenShake = Math.max(0, screenShake - 1.2);
    }
    p.push(); p.translate(sx, sy);

    drawStageBG();
    updateAmbientFX();

    if (!roundOver) {
      updateFighter(fighter1, fighter2, 0);
      updateFighter(fighter2, fighter1, 1);
    }
    animFighter(fighter1); animFighter(fighter2);

    drawFighterShadow(fighter1); drawFighterShadow(fighter2);
    drawFighterSprite(fighter2); drawFighterSprite(fighter1);
    drawHitEffects();
    drawComboFX();
    p.pop();

    drawHUD();

    // Timer
    if (!roundOver) {
      roundTimerRaw += p.deltaTime;
      if (roundTimerRaw >= 1000) { roundTimerRaw -= 1000; roundTimer--; }
      if (roundTimer <= 0) { roundTimer = 0; endRound(); }
    } else {
      roundOverTimer++;
      if (roundOverTimer > 200) STATE = 'GAMEOVER';
    }
    if (roundOver) drawRoundOverlay();
  }

  // ════════════════════════════════════════════════════════════
  //  HUD — Espada / God of War style
  //  Barras em forma de lâmina diagonal + ponta luminosa + ghost
  // ════════════════════════════════════════════════════════════

  // Estado interno do HUD (ghost de dano, animações)
  var _hud = {
    ghost1: 100, ghost2: 100,   // HP ghost (atrasado)
    ghostTimer1: 0, ghostTimer2: 0,
    hitFlash1: 0, hitFlash2: 0, // frames de flash de impacto
    sparks: [],                  // partículas de impacto
  };

  // Chamado por dealDamage — dispara efeitos visuais do HUD
  function hudOnHit(player, isCrit) {
    if (player === 1) { _hud.hitFlash1 = isCrit ? 18 : 10; _hud.ghostTimer1 = 38; }
    else { _hud.hitFlash2 = isCrit ? 18 : 10; _hud.ghostTimer2 = 38; }
    var barX = player === 1
      ? (16 + (CANVAS_W * 0.38) * (fighter1 ? fighter1.hp / fighter1.maxHp : 1))
      : (CANVAS_W - 16 - (CANVAS_W * 0.38) * (fighter2 ? fighter2.hp / fighter2.maxHp : 1));
    var count = isCrit ? 10 : 5;
    // OPT: limita sparks a 40 para não crescer sem controle
    if (_hud.sparks.length + count > 40) _hud.sparks.splice(0, count);
    for (var i = 0; i < count; i++) {
      _hud.sparks.push({
        x: barX + p.random(-10, 10),
        y: 18 + p.random(-6, 6),
        vx: p.random(-3, 3),
        vy: p.random(-4, -1),
        life: p.random(14, 24),
        maxLife: 24,
        col: player === 1 ? [60, 120, 255] : [220, 50, 30],
        r: p.random(1.5, 3),
      });
    }
  }

  function drawHUD() {
    if (!fighter1 || !fighter2) return;

    var ctx = p.drawingContext;
    var t = p.frameCount;
    var HH = 72;   // altura do painel HUD
    var MAR = 14;   // margem lateral
    var BW = CANVAS_W * 0.38;  // largura da barra HP
    var BH = 16;   // altura da barra HP
    var BY = 12;   // Y topo barra HP
    var SH = 5;    // altura barra stamina
    var SY = BY + BH + 5; // Y barra stamina

    // ── Ghost update ────────────────────────────────────────
    _hud.ghostTimer1 = Math.max(0, _hud.ghostTimer1 - 1);
    _hud.ghostTimer2 = Math.max(0, _hud.ghostTimer2 - 1);
    _hud.hitFlash1 = Math.max(0, _hud.hitFlash1 - 1);
    _hud.hitFlash2 = Math.max(0, _hud.hitFlash2 - 1);

    // Ghost drena suavemente após delay
    if (_hud.ghostTimer1 === 0) _hud.ghost1 = Math.max(_hud.ghost1 - 1.2, fighter1.hp / fighter1.maxHp * 100);
    if (_hud.ghostTimer2 === 0) _hud.ghost2 = Math.max(_hud.ghost2 - 1.2, fighter2.hp / fighter2.maxHp * 100);

    // Clamp ghost ao HP real
    _hud.ghost1 = Math.max(_hud.ghost1, fighter1.hp / fighter1.maxHp * 100);
    _hud.ghost2 = Math.max(_hud.ghost2, fighter2.hp / fighter2.maxHp * 100);

    // ── Fundo do HUD ────────────────────────────────────────
    p.push();
    // ctx.fillStyle = 'rgba(0,0,0,0.88)';
    // ctx.fillRect(0, 0, CANVAS_W, HH);
    // Linha ouro inferior
    // p.stroke(180, 140, 50, 55); p.strokeWeight(1);
    // p.line(0, HH, CANVAS_W, HH);
    // Ornamento — losangos nos cantos
    p.fill(180, 140, 50, 80); p.noStroke();
    p.push(); p.translate(MAR, HH / 2); p.rotate(Math.PI / 4); p.rect(-3, -3, 6, 6); p.pop();
    p.push(); p.translate(CANVAS_W - MAR, HH / 2); p.rotate(Math.PI / 4); p.rect(-3, -3, 6, 6); p.pop();
    p.pop();

    // ── Barra HP P1 (espada aponta para a direita) ──────────
    hudDrawSwordHP(
      MAR, BY, BW, BH,
      fighter1.hp / fighter1.maxHp,
      _hud.ghost1 / 100,
      _hud.hitFlash1,
      true,  // leftAlign
      1, t
    );

    // ── Barra Stamina P1 ────────────────────────────────────
    hudDrawSwordStam(MAR, SY, BW * 0.60, SH, fighter1.stamina / fighter1.maxStamina, true, 1);

    // ── Info P1 ─────────────────────────────────────────────
    p.push(); p.noStroke(); p.textFont(GAME_FONT);
    // Tag P1
    hudDrawPlayerTag(MAR, SY + SH + 5, 'P1', [30, 70, 200], true);
    // Nome
    p.fill(195); p.textStyle(p.BOLD); p.textSize(8);
    p.textAlign(p.LEFT, p.CENTER);
    p.text(fighter1.charData.name, MAR + 26, SY + SH + 11);
    // HP num
    p.fill(180, 140, 50, 160); p.textSize(7); p.textStyle(p.NORMAL);
    p.text(Math.ceil(fighter1.hp), MAR, BY + BH / 2);
    p.pop();

    // Combo P1
    if (fighter1.combo >= 2) hudDrawCombo(MAR, BY - 2, fighter1.combo, true, t);

    // Shield badge P1
    if (fighter1.state === 'SHIELD') hudDrawShield(MAR, SY + SH + 22, true);

    // ── Barra HP P2 (espada aponta para a esquerda) ─────────
    var P2X = CANVAS_W - MAR - BW;
    hudDrawSwordHP(
      P2X, BY, BW, BH,
      fighter2.hp / fighter2.maxHp,
      _hud.ghost2 / 100,
      _hud.hitFlash2,
      false, // rightAlign
      2, t
    );

    // ── Barra Stamina P2 ────────────────────────────────────
    hudDrawSwordStam(P2X + BW * 0.40, SY, BW * 0.60, SH, fighter2.stamina / fighter2.maxStamina, false, 2);

    // ── Info P2 ─────────────────────────────────────────────
    p.push(); p.noStroke(); p.textFont(GAME_FONT);
    hudDrawPlayerTag(CANVAS_W - MAR - 26, SY + SH + 5, 'P2', [180, 30, 20], false);
    p.fill(195); p.textStyle(p.BOLD); p.textSize(8);
    p.textAlign(p.RIGHT, p.CENTER);
    p.text(fighter2.charData.name, CANVAS_W - MAR - 28, SY + SH + 11);
    p.fill(180, 140, 50, 160); p.textSize(7); p.textStyle(p.NORMAL);
    p.textAlign(p.RIGHT, p.CENTER);
    p.text(Math.ceil(fighter2.hp), CANVAS_W - MAR, BY + BH / 2);
    p.pop();

    if (fighter2.combo >= 2) hudDrawCombo(CANVAS_W - MAR, BY - 2, fighter2.combo, false, t);
    if (fighter2.state === 'SHIELD') hudDrawShield(CANVAS_W - MAR, SY + SH + 22, false);

    // ── Timer — losango central ──────────────────────────────
    hudDrawTimerDiamond(CX, HH / 2 - 1, roundTimer, t);

    // ── Sparks de impacto ───────────────────────────────────
    hudDrawSparks();

    
  
  }

// ═══════════════════════════════════════════════════════════════
//  HUD RÚNICO — Shadow Kombat
//  Substitui as funções entre drawHUD() e drawStageBG()
//  Design inspirado em barras de pedra com runas, gemas e ornamentos
// ═══════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────
//  INSTRUÇÃO DE SUBSTITUIÇÃO:
//  No game.js, localize o bloco que começa em:
//    function drawHUD() {
//  e termina em:
//    function drawStamBar(x, y, w, h, ratio, col, leftAlign) { ... }
//    function drawCombo(x, y, combo, leftAlign) { ... }
//  (linha ~1749 até ~2168)
//  Substitua TODO esse bloco pelo código abaixo.
// ────────────────────────────────────────────────────────────────

  // ════════════════════════════════════════════════════════════
  //  drawHUD — orquestra todo o HUD rúnico
  // ════════════════════════════════════════════════════════════
  function drawHUD() {
    if (!fighter1 || !fighter2) return;

    var ctx = p.drawingContext;
    var t   = p.frameCount;

    // Dimensões gerais
    var HH  = 82;          // altura total do painel HUD
    var MAR = 10;          // margem lateral
    var BW  = CANVAS_W * 0.36; // largura da barra HP
    var BH  = 20;          // altura da barra HP
    var BY  = 26;          // Y topo barra HP
    var SH  = 6;           // altura barra stamina
    var SY  = BY + BH + 6; // Y barra stamina
    var MED = 30;          // raio do medalhão lateral

    // ── Ghost update ────────────────────────────────────────
    _hud.ghostTimer1 = Math.max(0, _hud.ghostTimer1 - 1);
    _hud.ghostTimer2 = Math.max(0, _hud.ghostTimer2 - 1);
    _hud.hitFlash1   = Math.max(0, _hud.hitFlash1   - 1);
    _hud.hitFlash2   = Math.max(0, _hud.hitFlash2   - 1);
    if (_hud.ghostTimer1 === 0) _hud.ghost1 = Math.max(_hud.ghost1 - 1.2, fighter1.hp / fighter1.maxHp * 100);
    if (_hud.ghostTimer2 === 0) _hud.ghost2 = Math.max(_hud.ghost2 - 1.2, fighter2.hp / fighter2.maxHp * 100);
    _hud.ghost1 = Math.max(_hud.ghost1, fighter1.hp / fighter1.maxHp * 100);
    _hud.ghost2 = Math.max(_hud.ghost2, fighter2.hp / fighter2.maxHp * 100);

    // ── P1 — barra + medalhão ────────────────────────────────
    var p1BarX = MAR + MED * 2 + 4; // barra começa após o medalhão
    var p1BarW = BW - MED * 2 - 4;

    runicDrawBar(p1BarX, BY, p1BarW, BH,
      fighter1.hp / fighter1.maxHp,
      _hud.ghost1 / 100,
      _hud.hitFlash1, true, 1, t);

    runicDrawStam(p1BarX, SY, p1BarW * 0.72, SH,
      fighter1.stamina / fighter1.maxStamina, true, 1, t);

    runicDrawMedallion(MAR + MED, BY + BH / 2, MED, 1,
      fighter1.charData, t);

    runicDrawEndTip(p1BarX + p1BarW, BY, BH, true, t);

    // Nome e HP numérico P1
    p.push(); p.noStroke(); p.textFont(GAME_FONT);
    p.fill(180, 160, 100, 180); p.textSize(7); p.textStyle(p.NORMAL);
    p.textAlign(p.LEFT, p.CENTER);
    p.text(fighter1.charData.name, p1BarX + 2, SY + SH + 9);
    p.fill(120, 100, 60, 140); p.textSize(6);
    p.text(Math.ceil(fighter1.hp) + ' HP', p1BarX + 2, SY + SH + 19);
    p.pop();

    // Combo P1
    if (fighter1.combo >= 2) hudDrawCombo(p1BarX + 2, BY - 4, fighter1.combo, true, t);
    // Shield P1
    if (fighter1.state === 'SHIELD') hudDrawShield(p1BarX, SY + SH + 24, true);

    // ── P2 — barra + medalhão ────────────────────────────────
    var p2BarW = BW - MED * 2 - 4;
    var p2BarX = CANVAS_W - MAR - MED * 2 - 4 - p2BarW;

    runicDrawBar(p2BarX, BY, p2BarW, BH,
      fighter2.hp / fighter2.maxHp,
      _hud.ghost2 / 100,
      _hud.hitFlash2, false, 2, t);

    runicDrawStam(p2BarX + p2BarW * 0.28, SY, p2BarW * 0.72, SH,
      fighter2.stamina / fighter2.maxStamina, false, 2, t);

    runicDrawMedallion(CANVAS_W - MAR - MED, BY + BH / 2, MED, 2,
      fighter2.charData, t);

    runicDrawEndTip(p2BarX, BY, BH, false, t);

    // Nome e HP numérico P2
    p.push(); p.noStroke(); p.textFont(GAME_FONT);
    p.fill(180, 160, 100, 180); p.textSize(7); p.textStyle(p.NORMAL);
    p.textAlign(p.RIGHT, p.CENTER);
    p.text(fighter2.charData.name, p2BarX + p2BarW - 2, SY + SH + 9);
    p.fill(120, 100, 60, 140); p.textSize(6);
    p.text(Math.ceil(fighter2.hp) + ' HP', p2BarX + p2BarW - 2, SY + SH + 19);
    p.pop();

    // Combo P2
    if (fighter2.combo >= 2) hudDrawCombo(p2BarX + p2BarW - 2, BY - 4, fighter2.combo, false, t);
    // Shield P2
    if (fighter2.state === 'SHIELD') hudDrawShield(p2BarX + p2BarW, SY + SH + 24, false);

    // ── Timer central ────────────────────────────────────────
    hudDrawTimerDiamond(CX, HH / 2, roundTimer, t);

    // ── Sparks ──────────────────────────────────────────────
    hudDrawSparks();
  }

  // ════════════════════════════════════════════════════════════
  //  runicDrawBar — barra de HP com moldura de pedra rúnica
  // ════════════════════════════════════════════════════════════
  function runicDrawBar(x, y, w, h, ratio, ghostRatio, flash, isLeft, player, t) {
    ratio      = Math.max(0, Math.min(1, ratio));
    ghostRatio = Math.max(ratio, Math.min(1, ghostRatio));

    var ctx = p.drawingContext;
    var r   = 5;

    // ── 1. Moldura de pedra — OPT: sem shadowBlur, gradiente reutilizado ──
    // OPT: gradiente de pedra é idêntico para todos os players/frames — cria 1×
    if (!_gradCache['stone_' + Math.round(y)]) {
      var sg2 = ctx.createLinearGradient(0, y - 4, 0, y + h + 4);
      sg2.addColorStop(0,    '#4a4236');
      sg2.addColorStop(0.35, '#332e24');
      sg2.addColorStop(1,    '#1a1610');
      _gradCache['stone_' + Math.round(y)] = sg2;
    }
    _roundRect(ctx, x - 4, y - 4, w + 8, h + 8, r + 2);
    ctx.fillStyle = _gradCache['stone_' + Math.round(y)];
    ctx.fill();

    ctx.strokeStyle = 'rgba(100,85,60,0.8)'; ctx.lineWidth = 1;
    _roundRect(ctx, x - 4, y - 4, w + 8, h + 8, r + 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 1.5;
    _roundRect(ctx, x - 3, y - 3, w + 6, h + 6, r + 1); ctx.stroke();

    // Rachaduras — determinísticas, custo fixo (3 linhas)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.5;
    var crackSeed = player * 137;
    for (var ci = 0; ci < 3; ci++) {
      crackSeed = (crackSeed * 1664525 + 1013904223) & 0xffffffff;
      var cx2 = x + (Math.abs(crackSeed) % w);
      ctx.beginPath(); ctx.moveTo(cx2, y - 4); ctx.lineTo(cx2 + 4, y + h + 4); ctx.stroke();
    }

    // ── 2. Canal interno ────────────────────────────────────
    _roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = '#0a0906'; ctx.fill();
    ctx.strokeStyle = 'rgba(20,15,8,0.9)'; ctx.lineWidth = 1; ctx.stroke();

    // ── 3. Ghost ────────────────────────────────────────────
    if (ghostRatio > ratio) {
      var ghostW = w * ghostRatio;
      var gx     = isLeft ? x : x + w - ghostW;
      ctx.save();
      ctx.beginPath(); _roundRect(ctx, x, y, w, h, r); ctx.clip();
      ctx.fillStyle = 'rgba(160,20,8,0.35)';
      ctx.fillRect(gx, y, ghostW, h);
      ctx.restore();
    }

    // ── 4. Fill principal ────────────────────────────────────
    var fillW = w * ratio;
    if (fillW > 1) {
      var fx = isLeft ? x : x + w - fillW;
      ctx.save();
      ctx.beginPath(); _roundRect(ctx, x, y, w, h, r); ctx.clip();

      // OPT: gradientes HP por tier — recria só quando muda de tier (não todo frame)
      // Tier: 0 = crítico (<=25%), 1 = alerta (<=50%), 2 = normal (>50%)
      var tier = ratio <= 0.25 ? 0 : ratio <= 0.5 ? 1 : 2;
      var gkey = 'hp_' + player + '_' + tier + '_' + isLeft;
      // Tier 0 (crítico) pulsa — recria a cada frame apenas nesse caso
      if (tier === 0 || !_gradCache[gkey]) {
        var gr;
        var gx0 = isLeft ? fx : fx + fillW, gx1 = isLeft ? fx + fillW : fx;
        if (tier === 0) {
          var pulse = 0.65 + Math.abs(Math.sin(t * 0.14)) * 0.35;
          gr = ctx.createLinearGradient(gx0, 0, gx1, 0);
          gr.addColorStop(0, 'rgba(100,0,0,' + pulse + ')');
          gr.addColorStop(1, 'rgba(210,18,10,' + pulse + ')');
        } else if (tier === 1) {
          gr = ctx.createLinearGradient(gx0, 0, gx1, 0);
          gr.addColorStop(0, '#5a2e00'); gr.addColorStop(1, '#cc7200');
        } else {
          gr = ctx.createLinearGradient(gx0, 0, gx1, 0);
          gr.addColorStop(0, '#0a4a46'); gr.addColorStop(0.5, '#1ab8b0'); gr.addColorStop(1, '#6afff6');
        }
        if (tier !== 0) _gradCache[gkey] = gr;
        ctx.fillStyle = gr;
      } else {
        ctx.fillStyle = _gradCache[gkey];
      }
      ctx.fillRect(fx, y, fillW, h);

      // Reflexo superior
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(fx, y, fillW, Math.ceil(h * 0.35));

      // Flash de impacto
      if (flash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + ((flash / 18) * 0.6) + ')';
        ctx.fillRect(fx, y, fillW, h);
      }

      // Divisórias rúnicas a cada 25%
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
      for (var d = 1; d < 4; d++) {
        var dx = x + (w / 4) * d;
        ctx.beginPath(); ctx.moveTo(dx, y); ctx.lineTo(dx, y + h); ctx.stroke();
      }
      ctx.restore();

      // ── 5. Ponta luminosa ────────────────────────────────
      var tipX = isLeft ? fx + fillW : fx;
      var tipY = y + h / 2;
      var tipAlpha = 0.55 + Math.abs(Math.sin(t * 0.08)) * 0.45;
      var tc = tier === 0 ? [220, 30, 10] : tier === 1 ? [200, 110, 0] : [78, 220, 210];
      p.push(); p.noStroke();
      p.fill(tc[0], tc[1], tc[2], tipAlpha * 35); p.ellipse(tipX, tipY, 18, 18);
      p.fill(tc[0], tc[1], tc[2], tipAlpha * 80); p.ellipse(tipX, tipY, 10, 10);
      p.fill(tc[0], tc[1], tc[2], 255);           p.ellipse(tipX, tipY, 5, 5);
      p.fill(255, 255, 255, 220);                  p.ellipse(tipX - 0.8, tipY - 0.8, 2, 2);
      p.pop();
    }

    // ── 6. Gemas nas extremidades ───────────────────────────
    var gemY = y + h / 2;
    var gemCol = [78, 200, 100];
    _runicGem(ctx, x - 4, gemY, 5, gemCol, t, 0);
    _runicGem(ctx, x + w + 4, gemY, 5, gemCol, t, 1);
  }

  // ════════════════════════════════════════════════════════════
  //  runicDrawStam — barra de stamina com moldura fina de pedra
  // ════════════════════════════════════════════════════════════
  function runicDrawStam(x, y, w, h, ratio, isLeft, player, t) {
    ratio = Math.max(0, Math.min(1, ratio));
    var ctx = p.drawingContext;
    var r   = 3;

    // Moldura fina
    ctx.save();
    _roundRect(ctx, x - 2, y - 2, w + 4, h + 4, r + 1);
    var sfg = ctx.createLinearGradient(0, y - 2, 0, y + h + 2);
    sfg.addColorStop(0, '#3a3228');
    sfg.addColorStop(1, '#1a1610');
    ctx.fillStyle = sfg; ctx.fill();
    ctx.strokeStyle = 'rgba(80,65,40,0.7)'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.restore();

    // Canal
    ctx.save();
    _roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = '#080706'; ctx.fill();
    ctx.restore();

    // Fill stamina
    if (ratio > 0) {
      var fw = w * ratio;
      var fx = isLeft ? x : x + w - fw;
      ctx.save();
      ctx.beginPath();
      _roundRect(ctx, x, y, w, h, r);
      ctx.clip();

      var sg = ctx.createLinearGradient(isLeft ? fx : fx + fw, 0,
                                        isLeft ? fx + fw : fx, 0);
      sg.addColorStop(0, '#1a6638');
      sg.addColorStop(1, '#3dcc78');
      ctx.fillStyle = sg;
      ctx.fillRect(fx, y, fw, h);

      // Reflexo
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(fx, y, fw, Math.ceil(h * 0.4));
      ctx.restore();
    }

    // Gemas flanqueando a stamina
    var gemY2 = y + h / 2;
    _runicGem(p.drawingContext, x - 2, gemY2, 4, [40, 180, 80], t, player * 10);
    _runicGem(p.drawingContext, x + w + 2, gemY2, 4, [40, 180, 80], t, player * 10 + 5);
  }

  // ════════════════════════════════════════════════════════════
  //  runicDrawMedallion — orbe com runa do personagem
  // ════════════════════════════════════════════════════════════
  function runicDrawMedallion(cx2, cy2, r, player, charData, t) {
    var ctx = p.drawingContext;
    var col = charData.col;
    var acc = charData.acc;

    // Fundo escuro (sem shadow — shadowBlur é lento no RPi)
    ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0e0c08'; ctx.fill();

    // Anel externo — pedra escura
    ctx.save();
    ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2);
    var outerGrad = ctx.createRadialGradient(cx2, cy2 - r * 0.3, 0, cx2, cy2, r);
    outerGrad.addColorStop(0, '#4a3e2e');
    outerGrad.addColorStop(1, '#1a1510');
    ctx.fillStyle = outerGrad; ctx.fill();
    ctx.strokeStyle = 'rgba(80,65,40,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    // OPT: gear simplificado — apenas o arco tracejado, sem save/restore extra
    p.push(); p.noFill();
    p.stroke(60, 50, 32, 180); p.strokeWeight(1);
    var gearR = r * 0.85;
    var dashLen = Math.PI * 2 * gearR / 20;
    p.drawingContext.setLineDash([dashLen * 0.55, dashLen * 0.45]);
    p.arc(cx2, cy2, gearR, gearR, 0, Math.PI * 2);
    p.drawingContext.setLineDash([]);
    p.pop();

    // Fundo interno com cor do personagem
    ctx.save();
    ctx.beginPath(); ctx.arc(cx2, cy2, r * 0.7, 0, Math.PI * 2);
    var innerGrad = ctx.createRadialGradient(cx2 - r * 0.2, cy2 - r * 0.2, 0, cx2, cy2, r * 0.7);
    innerGrad.addColorStop(0, 'rgba(' + col[0] * 0.4 + ',' + col[1] * 0.4 + ',' + col[2] * 0.4 + ',0.8)');
    innerGrad.addColorStop(1, 'rgba(' + col[0] * 0.1 + ',' + col[1] * 0.1 + ',' + col[2] * 0.1 + ',0.9)');
    ctx.fillStyle = innerGrad; ctx.fill();
    ctx.strokeStyle = 'rgba(' + acc[0] + ',' + acc[1] + ',' + acc[2] + ',0.25)';
    ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    // Runa do personagem
    var runeAlpha = 0.65 + Math.abs(Math.sin(t * 0.04 + player)) * 0.35;
    p.push(); p.noFill();
    p.stroke(acc[0], acc[1], acc[2], 255 * runeAlpha);
    p.strokeWeight(1.8);
    p.strokeCap(p.ROUND);

    var rs = r * 0.38;
    var id = charData.id || 0;
    if (id === 0) {
      p.line(cx2, cy2 - rs, cx2, cy2 + rs * 0.3);
      p.line(cx2 - rs * 0.7, cy2 - rs * 0.5, cx2, cy2);
      p.line(cx2 + rs * 0.7, cy2 - rs * 0.5, cx2, cy2);
      p.line(cx2, cy2 + rs * 0.3, cx2 - rs * 0.4, cy2 + rs);
      p.line(cx2, cy2 + rs * 0.3, cx2 + rs * 0.4, cy2 + rs);
    } else if (id === 1) {
      p.line(cx2 - rs * 0.4, cy2 - rs, cx2 - rs * 0.4, cy2 + rs);
      p.line(cx2 - rs * 0.4, cy2 - rs, cx2 + rs * 0.5, cy2 - rs * 0.2);
      p.line(cx2 + rs * 0.5, cy2 - rs * 0.2, cx2 - rs * 0.4, cy2);
      p.line(cx2 - rs * 0.4, cy2, cx2 + rs * 0.6, cy2 + rs);
    } else {
      p.line(cx2 - rs * 0.4, cy2 - rs, cx2 - rs * 0.4, cy2 + rs);
      p.line(cx2 - rs * 0.4, cy2 - rs, cx2 + rs * 0.5, cy2 - rs * 0.4);
      p.line(cx2 + rs * 0.5, cy2 - rs * 0.4, cx2 - rs * 0.4, cy2 - rs * 0.05);
      p.line(cx2 - rs * 0.4, cy2 + rs * 0.35, cx2 + rs * 0.6, cy2 + rs * 0.35);
    }
    p.pop();

    // OPT: gemas reduzidas de 4 para 2 (topo e baixo apenas) — salva 2 gradientes radiais/frame
    var gemColor = [acc[0], acc[1], acc[2]];
    _runicGem(ctx, cx2,     cy2 - r, 4, gemColor, t, 0);
    _runicGem(ctx, cx2,     cy2 + r, 4, gemColor, t, 2);

    // Parafusos nos diagonais
    var boltR = r * 0.18;
    var boltDist = r * 0.9;
    var boltAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    for (var bi = 0; bi < 4; bi++) {
      var bx2 = cx2 + Math.cos(boltAngles[bi]) * boltDist;
      var by2 = cy2 + Math.sin(boltAngles[bi]) * boltDist;
      ctx.beginPath(); ctx.arc(bx2, by2, boltR, 0, Math.PI * 2);
      ctx.fillStyle = '#1e1a12'; ctx.fill();
      ctx.strokeStyle = 'rgba(70,58,35,0.9)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
  }

  // ════════════════════════════════════════════════════════════
  //  runicDrawEndTip — ornamento de ponta nas extremidades da barra
  // ════════════════════════════════════════════════════════════
  function runicDrawEndTip(x, y, h, isLeft, t) {
    var ctx = p.drawingContext;
    var tw  = 18;

    // OPT: sem shadowBlur — removido por ser caro no RPi
    ctx.beginPath();
    if (isLeft) {
      ctx.moveTo(x,       y);
      ctx.lineTo(x + tw,  y + h / 2);
      ctx.lineTo(x,       y + h);
    } else {
      ctx.moveTo(x,       y + h / 2);
      ctx.lineTo(x - tw,  y);
      ctx.lineTo(x - tw * 2, y + h / 2);
      ctx.lineTo(x - tw,  y + h);
    }
    ctx.closePath();

    var tg = ctx.createLinearGradient(0, y, 0, y + h);
    tg.addColorStop(0, '#5a4e38');
    tg.addColorStop(1, '#2a2218');
    ctx.fillStyle = tg; ctx.fill();
    ctx.strokeStyle = 'rgba(100,80,50,0.7)'; ctx.lineWidth = 1; ctx.stroke();

    p.push(); p.noFill();
    p.stroke(78, 200, 210, 90); p.strokeWeight(1);
    if (isLeft) {
      p.line(x + 2, y + 2, x + tw - 2, y + h / 2);
      p.line(x + 2, y + h - 2, x + tw - 2, y + h / 2);
    } else {
      p.line(x - 2, y + h / 2, x - tw + 2, y + 2);
      p.line(x - 2, y + h / 2, x - tw + 2, y + h - 2);
    }
    p.pop();
  }

  // ════════════════════════════════════════════════════════════
  //  hudDrawTimerDiamond — losango central com gemas e runas
  // ════════════════════════════════════════════════════════════
  function hudDrawTimerDiamond(cx, cy, time, t) {
    var s       = 34;  // meia-diagonal do losango
    var danger  = time <= 10;
    var warn    = time <= 30 && !danger;
    var pulse   = Math.abs(Math.sin(t * (danger ? 0.18 : 0.06)));
    var ctx     = p.drawingContext;

    // ── Anel externo circular — OPT: sem shadowBlur ─────────────
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, s * 1.05, 0, Math.PI * 2);
    var ringGrad = ctx.createRadialGradient(cx, cy - s * 0.3, 0, cx, cy, s * 1.05);
    ringGrad.addColorStop(0, '#3a3020');
    ringGrad.addColorStop(1, '#141008');
    ctx.fillStyle = ringGrad; ctx.fill();

    // Anel dentado (gear) — tracejado
    ctx.strokeStyle = 'rgba(70,55,30,0.9)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, s * 1.02, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // Borda sólida
    ctx.strokeStyle = 'rgba(90,72,42,0.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, s * 1.05, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // ── Losango interno ──────────────────────────────────────
    p.push(); p.noStroke();
    p.fill(14, 11, 7);
    p.beginShape();
    p.vertex(cx,     cy - s);
    p.vertex(cx + s, cy);
    p.vertex(cx,     cy + s);
    p.vertex(cx - s, cy);
    p.endShape(p.CLOSE);
    p.pop();

    // Borda do losango — cor dinâmica
    var bc;
    if (danger)     bc = p.color(200 + pulse * 55, 20, 10, 180 + pulse * 75);
    else if (warn)  bc = p.color(190, 110, 15, 170);
    else            bc = p.color(78, 200, 200, 120 + pulse * 60);

    p.push();
    p.stroke(bc); p.strokeWeight(1.5 + pulse * 0.5); p.noFill();
    p.beginShape();
    p.vertex(cx,     cy - s);
    p.vertex(cx + s, cy);
    p.vertex(cx,     cy + s);
    p.vertex(cx - s, cy);
    p.endShape(p.CLOSE);
    // Borda interna sutil
    p.stroke(30, 22, 12, 180); p.strokeWeight(2);
    p.beginShape();
    p.vertex(cx,         cy - s + 4);
    p.vertex(cx + s - 4, cy);
    p.vertex(cx,         cy + s - 4);
    p.vertex(cx - s + 4, cy);
    p.endShape(p.CLOSE);
    p.pop();

    // ── Gemas nos 4 vértices ─────────────────────────────────
    var gemC = danger ? [220, 40, 20] : warn ? [200, 130, 10] : [78, 220, 210];
    _runicGem(p.drawingContext, cx,     cy - s, 5, gemC, t, 0);
    _runicGem(p.drawingContext, cx + s, cy,     5, gemC, t, 15);
    _runicGem(p.drawingContext, cx,     cy + s, 5, gemC, t, 30);
    _runicGem(p.drawingContext, cx - s, cy,     5, gemC, t, 45);

    // Número do timer (sem glow/shadowBlur — OPT RPi)
    p.push(); p.noStroke();
    if      (danger && t % 12 < 6) p.fill(230, 45, 30);
    else if (warn)                  p.fill(210, 120, 15);
    else                            p.fill(78, 220, 210);
    p.textFont(GAME_FONT); p.textStyle(p.BOLD);
    p.textSize(20); p.textAlign(p.CENTER, p.CENTER);
    p.text(time < 10 ? '0' + time : time, cx, cy + 1);

    // Label TIME
    p.fill(60, 50, 32, 200); p.textSize(5); p.textStyle(p.NORMAL);
    p.text('TIME', cx, cy + s - 10);
    p.pop();
  }

  // ════════════════════════════════════════════════════════════
  //  hudDrawCombo — badge de combo (mantido, apenas reestilizado)
  // ════════════════════════════════════════════════════════════
  function hudDrawCombo(x, y, combo, isLeft, t) {
    var pulse = 0.8 + Math.abs(Math.sin(t * 0.12)) * 0.2;
    p.push(); p.noStroke();
    p.textFont(GAME_FONT); p.textStyle(p.BOLD);
    p.textAlign(isLeft ? p.LEFT : p.RIGHT, p.CENTER);
    p.fill(78, 220, 210, 220 * pulse);
    p.textSize(13);
    p.text(combo + 'x', x, y);
    p.fill(50, 160, 155, 160 * pulse);
    p.textSize(6); p.textStyle(p.NORMAL);
    p.text('COMBO', x + (isLeft ? 20 : -20), y);
    p.pop();
  }

  // ════════════════════════════════════════════════════════════
  //  hudDrawShield — badge de bloqueio (mantido)
  // ════════════════════════════════════════════════════════════
  function hudDrawShield(x, y, isLeft) {
    p.push(); p.noStroke();
    p.fill(0, 70, 160, 200);
    var w = 56, h = 10;
    var px = isLeft ? x : x - w;
    p.beginShape();
    p.vertex(px + 3, y); p.vertex(px + w, y);
    p.vertex(px + w - 3, y + h); p.vertex(px, y + h);
    p.endShape(p.CLOSE);
    p.fill(140, 200, 255);
    p.textFont(GAME_FONT); p.textStyle(p.BOLD); p.textSize(6);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('BLOQUEANDO', px + w / 2, y + h / 2);
    p.pop();
  }

  // ════════════════════════════════════════════════════════════
  //  hudDrawSparks — partículas de impacto (mantido)
  // ════════════════════════════════════════════════════════════
  function hudDrawSparks() {
    _hud.sparks = _hud.sparks.filter(function(s) { return s.life > 0; });
    p.push(); p.noStroke();
    for (var i = 0; i < _hud.sparks.length; i++) {
      var s = _hud.sparks[i];
      s.x  += s.vx; s.y += s.vy; s.vy += 0.3; s.life--;
      var a = (s.life / s.maxLife) * 255;
      p.fill(s.col[0], s.col[1], s.col[2], a);
      p.ellipse(s.x, s.y, s.r * (s.life / s.maxLife) * 2);
    }
    p.pop();
  }

  // ════════════════════════════════════════════════════════════
  //  Wrappers de compatibilidade (não remover — usados internamente)
  // ════════════════════════════════════════════════════════════
  function hudDrawSwordHP(x, y, w, h, ratio, ghostRatio, flash, isLeft, player, t) {
    runicDrawBar(x, y, w, h, ratio, ghostRatio, flash, isLeft, player, t);
  }
  function hudDrawSwordStam(x, y, w, h, ratio, isLeft, player) {
    runicDrawStam(x, y, w, h, ratio, isLeft, player, p.frameCount);
  }
  function drawHPBar(x, y, w, h, ratio, col, leftAlign) {
    runicDrawBar(x, y, w, h, ratio, ratio, 0, leftAlign, leftAlign ? 1 : 2, p.frameCount);
  }
  function drawStamBar(x, y, w, h, ratio, col, leftAlign) {
    runicDrawStam(x, y, w, h, ratio, leftAlign, leftAlign ? 1 : 2, p.frameCount);
  }
  function drawCombo(x, y, combo, leftAlign) {
    hudDrawCombo(x, y, combo, leftAlign, p.frameCount);
  }

  // ════════════════════════════════════════════════════════════
  //  HELPERS INTERNOS
  // ════════════════════════════════════════════════════════════

  // Retângulo com cantos arredondados via canvas 2D API
  function _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // OPT: shadowBlur é muito custoso no Raspberry Pi — removido das gemas.
  // Usa apenas o gradiente radial com brilho pulsante (visual preservado, custo baixo).
  function _runicGem(ctx, cx, cy, r, col, t, phase) {
    var alpha = 0.75 + Math.abs(Math.sin(t * 0.05 + phase * 0.1)) * 0.25;

    // Corpo da gema — gradiente radial (sem shadow)
    var gg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
    gg.addColorStop(0,   'rgba(255,255,255,' + (alpha * 0.9) + ')');
    gg.addColorStop(0.3, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + alpha + ')');
    gg.addColorStop(1,   'rgba(' + Math.floor(col[0] * 0.2) + ',' +
                                   Math.floor(col[1] * 0.2) + ',' +
                                   Math.floor(col[2] * 0.2) + ',' + alpha + ')');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    // Anel externo sutil
    ctx.strokeStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.4)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, Math.PI * 2); ctx.stroke();
  }

// ═══════════════════════════════════════════════════════════════
//  FIM DO HUD RÚNICO
// ═══════════════════════════════════════════════════════════════

  // ── Shield badge ────────────────────────────────────────────
  function hudDrawShield(x, y, isLeft) {
    p.push(); p.noStroke();
    p.fill(0, 70, 160, 200);
    var w = 56, h = 10;
    var px = isLeft ? x : x - w;
    // Clip diagonal
    p.beginShape();
    p.vertex(px + 3, y); p.vertex(px + w, y);
    p.vertex(px + w - 3, y + h); p.vertex(px, y + h);
    p.endShape(p.CLOSE);
    p.fill(140, 200, 255);
    p.textFont(GAME_FONT); p.textStyle(p.BOLD); p.textSize(6);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('BLOQUEANDO', px + w / 2, y + h / 2);
    p.pop();
  }

  // ── Sparks de impacto ───────────────────────────────────────
  function hudDrawSparks() {
    _hud.sparks = _hud.sparks.filter(function (s) { return s.life > 0; });
    p.push(); p.noStroke();
    for (var i = 0; i < _hud.sparks.length; i++) {
      var s = _hud.sparks[i];
      s.x += s.vx; s.y += s.vy; s.vy += 0.3; s.life--;
      var a = (s.life / s.maxLife) * 255;
      p.fill(s.col[0], s.col[1], s.col[2], a);
      p.ellipse(s.x, s.y, s.r * (s.life / s.maxLife) * 2);
    }
    p.pop();
  }

  // ── HP Bar (mantido como wrapper para compatibilidade) ───────
  function drawHPBar(x, y, w, h, ratio, col, leftAlign) {
    hudDrawSwordHP(x, y, w, h, ratio, ratio, 0, leftAlign, leftAlign ? 1 : 2, p.frameCount);
  }

  // ── Stam Bar wrapper ────────────────────────────────────────
  function drawStamBar(x, y, w, h, ratio, col, leftAlign) {
    hudDrawSwordStam(x, y, w, h, ratio, leftAlign, leftAlign ? 1 : 2);
  }

  // ── Combo wrapper ───────────────────────────────────────────
  function drawCombo(x, y, combo, leftAlign) {
    hudDrawCombo(x, y, combo, leftAlign, p.frameCount);
  }

  // OPT: pré-calcula posições das estrelas por stage (chamado 1× por stage)
  function _buildStarCache(st) {
    var stars = [];
    var seed = st.id * 99 + 7;
    for (var s = 0; s < 60; s++) {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      var stx = (seed >>> 0) % CANVAS_W;
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      var sty = (seed >>> 0) % (GROUND_Y - 40);
      stars.push({ x: stx, y: sty, blink: s % 3 === 0, phase: s });
    }
    return stars;
  }

  // ─── Stage background — gradientes via drawingContext (sem loops) ──
  function drawStageBG() {
    var st = selectedStage || STAGES[0];
    var ctx = p.drawingContext;

    var img = stageImages[st.id];
    if (img && img !== 'loading' && img.width > 10) {
      var iw = img.width, ih = img.height;
      var scaleX = CANVAS_W / iw, scaleY = CANVAS_H / ih;
      var sc = Math.max(scaleX, scaleY);
      var dw = iw * sc, dh = ih * sc;
      var dx = (CANVAS_W - dw) / 2, dy = (CANVAS_H - dh) / 2;
      p.push(); p.imageMode(p.CORNER);
      p.image(img, dx, dy, dw, dh);
      p.pop();
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      return;
    }

    // OPT: reutiliza gradientes de céu/chão/névoa por stage (cria 1× por stage)
    var ckey = 'sky_' + st.id;
    if (!_gradCache[ckey]) {
      var _c = document.createElement('canvas');
      _c.width = 4; _c.height = CANVAS_H;
      var _cx2 = _c.getContext('2d');

      var sg = _cx2.createLinearGradient(0, 0, 0, GROUND_Y);
      sg.addColorStop(0, 'rgb(' + st.sky1[0] + ',' + st.sky1[1] + ',' + st.sky1[2] + ')');
      sg.addColorStop(1, 'rgb(' + st.sky2[0] + ',' + st.sky2[1] + ',' + st.sky2[2] + ')');
      _cx2.fillStyle = sg; _cx2.fillRect(0, 0, 4, GROUND_Y);

      var r1 = Math.min(255, st.ground[0] * 1.3), g1 = Math.min(255, st.ground[1] * 1.3), b1 = Math.min(255, st.ground[2] * 1.3);
      var r2 = Math.floor(st.ground[0] * 0.3), g2 = Math.floor(st.ground[1] * 0.3), b2 = Math.floor(st.ground[2] * 0.3);
      var gg = _cx2.createLinearGradient(0, GROUND_Y, 0, CANVAS_H);
      gg.addColorStop(0, 'rgb(' + Math.floor(r1) + ',' + Math.floor(g1) + ',' + Math.floor(b1) + ')');
      gg.addColorStop(1, 'rgb(' + r2 + ',' + g2 + ',' + b2 + ')');
      _cx2.fillStyle = gg; _cx2.fillRect(0, GROUND_Y, 4, CANVAS_H - GROUND_Y);

      _gradCache[ckey] = _c;
    }
    // Estica o canvas de 4px para cobrir toda a largura (muito rápido)
    ctx.drawImage(_gradCache[ckey], 0, 0, CANVAS_W, CANVAS_H);

    // OPT: estrelas em cache — só recalcula ao mudar de stage
    if (!_starCache[st.id]) _starCache[st.id] = _buildStarCache(st);
    var stars = _starCache[st.id];
    p.push(); p.noStroke();
    var fc = p.frameCount;
    for (var s = 0; s < stars.length; s++) {
      var sr = stars[s];
      var blink = sr.blink ? Math.abs(Math.sin(fc * 0.02 + sr.phase)) : 0.7;
      p.fill(255, 255, 255, blink * 130);
      p.rect(sr.x, sr.y, 1, 1);
    }
    p.pop();

    // Névoa
    var fogGrad = ctx.createLinearGradient(0, GROUND_Y - 70, 0, GROUND_Y + 20);
    fogGrad.addColorStop(0, 'rgba(' + st.fog[0] + ',' + st.fog[1] + ',' + st.fog[2] + ',0)');
    fogGrad.addColorStop(0.6, 'rgba(' + st.fog[0] + ',' + st.fog[1] + ',' + st.fog[2] + ',0.25)');
    fogGrad.addColorStop(1, 'rgba(' + st.fog[0] + ',' + st.fog[1] + ',' + st.fog[2] + ',0)');
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, GROUND_Y - 70, CANVAS_W, 90);

    // Grade de perspectiva
    p.push();
    p.stroke(st.fog[0], st.fog[1], st.fog[2], 35); p.strokeWeight(1);
    var steps = 8;
    for (var i = 0; i <= steps; i++) {
      var bx = p.map(i, 0, steps, 0, CANVAS_W);
      p.line(CX, GROUND_Y, bx, CANVAS_H);
    }
    for (var j = 1; j <= 4; j++) {
      var t2 = (j / 4) * (j / 4);
      var gy = GROUND_Y + (CANVAS_H - GROUND_Y) * t2 * 0.85;
      p.line(0, gy, CANVAS_W, gy);
    }
    p.pop();
  }

  // ════════════════════════════════════════════════════════════
  //  EFEITOS DE AMBIENTE — raios, trovões, brasas, cristais, fumaça
  //  Chamado em drawFight() logo após drawStageBG()
  // ════════════════════════════════════════════════════════════
  function updateAmbientFX() {
    var st = selectedStage || STAGES[0];
    var ctx = p.drawingContext;
    var t = p.frameCount;

    // ── Determina "clima" do stage ──────────────────────────
    // 0=TEMPLO(sombra/raios roxos), 1=ARENA(raios alaranjados),
    // 2=RUINAS(raios azuis+cristais), 3=VULCAO(brasas)
    var sid = st.id;
    var acR = st.accent[0], acG = st.accent[1], acB = st.accent[2];

    // ── Flash de trovão — clarão no céu ──────────────────────
    if (_amb.thunderFlash > 0) {
      var flashAlpha = (_amb.thunderFlash / 10) * 80;
      ctx.fillStyle = 'rgba(' + acR + ',' + acG + ',' + acB + ',' + (flashAlpha / 255) + ')';
      ctx.fillRect(0, 0, CANVAS_W, GROUND_Y * 0.85);
      _amb.thunderFlash--;
    }

    // ── Raio ─────────────────────────────────────────────────
    _amb.lightningTimer--;
    if (_amb.lightningTimer <= 0) {
      // Intervalo aleatório: 2-6 segundos (60fps)
      _amb.lightningTimer = 120 + Math.floor(Math.random() * 240);

      // Gera raio ziguezague do céu até o horizonte
      var lx = CANVAS_W * (0.15 + Math.random() * 0.7);
      var segs = [];
      var cx2 = lx, cy2 = 0;
      var branches = [];
      while (cy2 < GROUND_Y * 0.82) {
        var step = 28 + Math.random() * 40;
        var jitter = (Math.random() - 0.5) * 80;
        cx2 += jitter; cy2 += step;
        cx2 = Math.max(20, Math.min(CANVAS_W - 20, cx2));
        segs.push({ x: cx2, y: cy2 });
        // Ramificação aleatória
        if (Math.random() < 0.28 && cy2 < GROUND_Y * 0.6) {
          var bx = cx2, by = cy2;
          var bsegs = [];
          for (var bi = 0; bi < 3 + Math.floor(Math.random() * 3); bi++) {
            bx += (Math.random() - 0.5) * 70 + (Math.random() > 0.5 ? 18 : -18);
            by += 22 + Math.random() * 30;
            bsegs.push({ x: bx, y: by });
          }
          branches.push(bsegs);
        }
      }
      _amb.lightning = {
        x1: lx, y1: 0,
        segs: segs,
        branches: branches || [],
        life: 18, maxLife: 18,
        col: [acR, acG, acB],
      };
      _amb.thunderFlash = 10;
      // Som procedural de trovão (burst de ruído grave)
      SFX._thunderSound && SFX._thunderSound();
    }

    // Desenha raio ativo
    if (_amb.lightning) {
      var lr = _amb.lightning;
      lr.life--;
      if (lr.life <= 0) { _amb.lightning = null; }
      else {
        var la = (lr.life / lr.maxLife);
        var lw = la * 3.5;
        ctx.save();
        ctx.globalAlpha = la * 0.9;
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.lineWidth = lw;
        ctx.shadowColor = 'rgb(' + lr.col[0] + ',' + lr.col[1] + ',' + lr.col[2] + ')';
        ctx.shadowBlur = 18 * la;
        ctx.beginPath();
        ctx.moveTo(lr.x1, lr.y1);
        for (var si = 0; si < lr.segs.length; si++) {
          ctx.lineTo(lr.segs[si].x, lr.segs[si].y);
        }
        ctx.stroke();
        // Ramificações — mais finas
        ctx.lineWidth = lw * 0.45;
        ctx.globalAlpha = la * 0.55;
        for (var bi2 = 0; bi2 < lr.branches.length; bi2++) {
          var bsegs2 = lr.branches[bi2];
          if (!bsegs2.length) continue;
          // encontra ponto de origem na segs
          var oriIdx = Math.floor(bi2 * lr.segs.length / Math.max(1, lr.branches.length));
          var ori = lr.segs[Math.min(oriIdx, lr.segs.length - 1)];
          ctx.beginPath();
          ctx.moveTo(ori.x, ori.y);
          for (var bk = 0; bk < bsegs2.length; bk++) ctx.lineTo(bsegs2[bk].x, bsegs2[bk].y);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // ── Efeitos por tipo de stage ────────────────────────────
    if (sid === 3) {
      // VULCÃO — brasas subindo
      if (t % 3 === 0 && _amb.embers.length < 60) {
        _amb.embers.push({
          x: Math.random() * CANVAS_W,
          y: GROUND_Y + Math.random() * 60,
          vx: (Math.random() - 0.5) * 1.2,
          vy: -(1.2 + Math.random() * 2.2),
          size: 1.5 + Math.random() * 3,
          life: 80 + Math.floor(Math.random() * 60),
          maxLife: 140,
          r: 255, g: 80 + Math.floor(Math.random() * 120), b: 0,
        });
      }
      p.push(); p.noStroke();
      for (var ei = _amb.embers.length - 1; ei >= 0; ei--) {
        var em = _amb.embers[ei];
        em.x += em.vx + Math.sin(t * 0.04 + ei) * 0.4;
        em.y += em.vy;
        em.life--;
        if (em.life <= 0 || em.y < -20) { _amb.embers.splice(ei, 1); continue; }
        var ea = (em.life / em.maxLife);
        p.fill(em.r, em.g, em.b, ea * 200);
        p.ellipse(em.x, em.y, em.size, em.size);
      }
      p.pop();

    } else if (sid === 2) {
      // RUÍNAS GELADAS — cristais/neve caindo
      if (t % 4 === 0 && _amb.iceShards.length < 50) {
        _amb.iceShards.push({
          x: Math.random() * CANVAS_W,
          y: -10,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 1.0 + Math.random() * 1.8,
          size: 1 + Math.random() * 2.5,
          life: 200,
          maxLife: 200,
        });
      }
      p.push(); p.noStroke();
      for (var ii = _amb.iceShards.length - 1; ii >= 0; ii--) {
        var ic = _amb.iceShards[ii];
        ic.x += ic.vx + Math.sin(t * 0.02 + ii * 0.7) * 0.3;
        ic.y += ic.vy;
        ic.life--;
        if (ic.life <= 0 || ic.y > CANVAS_H + 10) { _amb.iceShards.splice(ii, 1); continue; }
        var ia = Math.min(1, ic.life / 40) * 0.75;
        p.fill(180, 220, 255, ia * 200);
        p.ellipse(ic.x, ic.y, ic.size, ic.size);
      }
      p.pop();

    } else if (sid === 0) {
      // TEMPLO DAS SOMBRAS — fumaça rasteira no chão
      if (t % 5 === 0 && _amb.smokeParticles.length < 30) {
        _amb.smokeParticles.push({
          x: Math.random() * CANVAS_W,
          y: GROUND_Y + Math.random() * 30,
          vx: (Math.random() - 0.5) * 0.5,
          vy: -(0.2 + Math.random() * 0.4),
          size: 30 + Math.random() * 60,
          life: 120 + Math.floor(Math.random() * 80),
          maxLife: 200,
        });
      }
      p.push(); p.noStroke();
      for (var smi = _amb.smokeParticles.length - 1; smi >= 0; smi--) {
        var sm = _amb.smokeParticles[smi];
        sm.x += sm.vx;
        sm.y += sm.vy;
        sm.size += 0.4;
        sm.life--;
        if (sm.life <= 0) { _amb.smokeParticles.splice(smi, 1); continue; }
        var sma = (sm.life / sm.maxLife) * 0.13;
        p.fill(acR * 0.4, acG * 0.4, acB * 0.4, sma * 255);
        p.ellipse(sm.x, sm.y, sm.size, sm.size * 0.35);
      }
      p.pop();
    }
    // ARENA DO CAOS (sid=1) — só raios, sem efeito extra
  }

  // ════════════════════════════════════════════════════════════
  //  EFEITOS ESPECIAIS DE COMBO
  //  Chamado em dealDamage() e desenhado em drawFight()
  // ════════════════════════════════════════════════════════════
  function spawnComboFX(attacker) {
    var combo = attacker.combo;
    if (combo < 3) return; // só dispara a partir de 3x

    var st = selectedStage || STAGES[0];
    var col = attacker.charData ? attacker.charData.acc : [255, 200, 0];
    var x = attacker.x;
    var y = attacker.y - 80;

    if (combo >= 7) {
      // ── ULTRA COMBO (7x+) — explosão de partículas + onda de choque ──
      _comboFX.push({ type: 'ultra', x: x, y: y, life: 55, maxLife: 55, col: col, combo: combo, pNum: attacker.playerNum });
      // Spawn rajada de partículas
      for (var i = 0; i < 28; i++) {
        var ang = (i / 28) * Math.PI * 2;
        var spd = 4 + Math.random() * 7;
        _comboFX.push({
          type: 'particle',
          x: x, y: y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 3,
          life: 35 + Math.floor(Math.random() * 20),
          maxLife: 55,
          col: col,
          size: 4 + Math.random() * 6,
        });
      }
      screenShake = Math.max(screenShake, 12);
    } else if (combo >= 5) {
      // ── MEGA COMBO (5-6x) — anel de energia + raios ──
      _comboFX.push({ type: 'ring', x: x, y: y, life: 38, maxLife: 38, col: col, combo: combo });
      for (var j = 0; j < 14; j++) {
        var ang2 = (j / 14) * Math.PI * 2;
        var spd2 = 2.5 + Math.random() * 4.5;
        _comboFX.push({
          type: 'particle',
          x: x, y: y,
          vx: Math.cos(ang2) * spd2,
          vy: Math.sin(ang2) * spd2 - 2,
          life: 25 + Math.floor(Math.random() * 15),
          maxLife: 40,
          col: col,
          size: 3 + Math.random() * 4,
        });
      }
      screenShake = Math.max(screenShake, 7);
    } else if (combo >= 3) {
      // ── COMBO (3-4x) — estrela de luz ──
      _comboFX.push({ type: 'burst', x: x, y: y, life: 25, maxLife: 25, col: col, combo: combo });
      for (var k = 0; k < 8; k++) {
        var ang3 = (k / 8) * Math.PI * 2;
        _comboFX.push({
          type: 'particle',
          x: x, y: y,
          vx: Math.cos(ang3) * (1.5 + Math.random() * 3),
          vy: Math.sin(ang3) * (1.5 + Math.random() * 3) - 1.5,
          life: 18 + Math.floor(Math.random() * 10),
          maxLife: 28,
          col: col,
          size: 2 + Math.random() * 3,
        });
      }
    }
  }

  function drawComboFX() {
    if (_comboFX.length === 0) return;
    var ctx = p.drawingContext;
    p.push();

    for (var i = _comboFX.length - 1; i >= 0; i--) {
      var fx = _comboFX[i];
      fx.life--;
      if (fx.life <= 0) { _comboFX.splice(i, 1); continue; }
      var prog = 1 - fx.life / fx.maxLife;
      var al = fx.life / fx.maxLife;
      var r = fx.col[0], g = fx.col[1], b = fx.col[2];

      if (fx.type === 'particle') {
        fx.x += fx.vx; fx.y += fx.vy;
        fx.vy += 0.18; // gravidade leve
        p.noStroke();
        p.fill(r, g, b, al * 220);
        p.ellipse(fx.x, fx.y, fx.size * al + 1, fx.size * al + 1);

      } else if (fx.type === 'burst') {
        // Estrela de raios — 8 linhas saindo do centro
        var radius = prog * 80;
        ctx.save();
        ctx.globalAlpha = al * 0.85;
        ctx.strokeStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.shadowColor = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.shadowBlur = 10;
        for (var ri = 0; ri < 8; ri++) {
          var ang = (ri / 8) * Math.PI * 2;
          var inner = radius * 0.25;
          ctx.lineWidth = 2.5 * al;
          ctx.beginPath();
          ctx.moveTo(fx.x + Math.cos(ang) * inner, fx.y + Math.sin(ang) * inner);
          ctx.lineTo(fx.x + Math.cos(ang) * radius, fx.y + Math.sin(ang) * radius);
          ctx.stroke();
        }
        // Texto do combo
        ctx.globalAlpha = al;
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.font = 'bold ' + Math.floor(22 + prog * 8) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(fx.combo + 'x COMBO', fx.x, fx.y - 30 - prog * 20);
        ctx.restore();

      } else if (fx.type === 'ring') {
        // Anel de energia expandindo
        var rRad = prog * 140;
        ctx.save();
        ctx.globalAlpha = al * 0.9;
        ctx.strokeStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.shadowColor = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.shadowBlur = 20;
        ctx.lineWidth = (1 - prog) * 8 + 1;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, rRad, 0, Math.PI * 2);
        ctx.stroke();
        // Segundo anel defasado
        ctx.lineWidth = (1 - prog) * 4;
        ctx.globalAlpha = al * 0.4;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, rRad * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        // Texto grande
        ctx.globalAlpha = al;
        ctx.fillStyle = 'rgb(255,255,255)';
        ctx.shadowColor = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.shadowBlur = 14;
        ctx.font = 'bold ' + Math.floor(28 + prog * 10) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(fx.combo + 'x COMBO!', fx.x, fx.y - 40 - prog * 25);
        ctx.restore();

      } else if (fx.type === 'ultra') {
        // Onda de choque dupla + texto épico
        var uRad = prog * 220;
        ctx.save();
        // Onda exterior
        ctx.globalAlpha = al * 0.75;
        ctx.strokeStyle = 'rgb(255,255,255)';
        ctx.shadowColor = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.shadowBlur = 30;
        ctx.lineWidth = (1 - prog) * 12 + 1;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, uRad, 0, Math.PI * 2);
        ctx.stroke();
        // Onda interior colorida
        ctx.strokeStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.lineWidth = (1 - prog) * 6;
        ctx.globalAlpha = al * 0.55;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, uRad * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        // Flash central
        if (prog < 0.2) {
          ctx.globalAlpha = (0.2 - prog) / 0.2 * 0.5;
          ctx.fillStyle = 'rgb(255,255,255)';
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        }
        // Texto ULTRA pulsante
        var pulse = 1 + Math.sin(fx.life * 0.4) * 0.08;
        ctx.globalAlpha = al;
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.shadowColor = 'rgb(255,255,255)';
        ctx.shadowBlur = 18;
        ctx.font = 'bold ' + Math.floor((36 + prog * 14) * pulse) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ULTRA  ' + fx.combo + 'x!!', fx.x, fx.y - 55 - prog * 30);
        ctx.restore();
      }
    }
    p.pop();
  }

  function drawFighterShadow(f) {
    if (!f) return;
    var scl = 1 - (GROUND_Y - f.y) / GROUND_Y * 0.3;
    p.push(); p.noStroke(); p.fill(0, 0, 0, 50);
    p.ellipse(f.x, GROUND_Y + 5, 65 * scl, 11 * scl);
    p.pop();
  }

  function drawFighterSprite(f) {
    if (!f) return;
    var animName = STATE_TO_ANIM[f.state] || 'Idle';
    var img = sprites[f.charData.folder] ? sprites[f.charData.folder][animName] : null;

    p.push();
    p.translate(f.x, f.y);
    p.scale(f.facing, 1);

    if (f.hurtCooldown > 0 && Math.floor(p.frameCount / 3) % 2 === 0) {
      p.drawingContext.globalAlpha = 0.35;
    }

    if (img && img.width > 10) {
      var def = getAnim(f, animName);
      var fw = Math.floor(img.width / def.frames);
      var fh = img.height;
      var safeFrame = Math.min(f.frame, def.frames - 1);
      var drawW = fw * SP_SCALE;
      var drawH = fh * SP_SCALE;
      p.drawingContext.imageSmoothingEnabled = false;
      p.image(img, -drawW / 2, -drawH, drawW, drawH, safeFrame * fw, 0, fw, fh);
    } else {
      drawPlaceholder(f, animName);
    }
    p.drawingContext.globalAlpha = 1;
    p.pop();

    // Escudo visual
    if (f.state === 'SHIELD') {
      p.push(); p.translate(f.x, f.y);
      var a = Math.abs(Math.sin(p.frameCount * 0.15)) * 80 + 90;
      p.noFill(); p.stroke(0, 160, 255, a); p.strokeWeight(3);
      p.ellipse(0, -55, 80, 110);
      p.stroke(100, 210, 255, a * 0.35); p.strokeWeight(9);
      p.ellipse(0, -55, 80, 110);
      p.pop();
    }
  }

  function drawPlaceholder(f, animName) {
    var col = f.charData.col, acc = f.charData.acc;
    var t = p.frameCount, fr = f.frame;
    var bobY = 0, limbA = 0, squash = 1, stretch = 1;

    if (animName === 'Idle') { bobY = Math.sin(t * 0.1) * 3; }
    else if (animName === 'Walk') { bobY = Math.abs(Math.sin(fr * Math.PI / 3)) * -5; limbA = Math.sin(fr * Math.PI / 3) * 0.4; }
    else if (animName === 'Run') { bobY = Math.abs(Math.sin(fr * Math.PI / 3)) * -9; limbA = Math.sin(fr * Math.PI / 3) * 0.7; }
    else if (animName === 'Jump') { var ph = fr / 5; bobY = -70 * Math.sin(ph * Math.PI); stretch = 1 + Math.abs(Math.sin(ph * Math.PI)) * 0.25; squash = 1 / stretch; }
    else if (animName.indexOf('Attack') === 0) { if (fr >= 2 && fr <= 3) limbA = 0.9; }
    else if (animName === 'Hurt') { bobY = -5; }
    else if (animName === 'Dead') { bobY = p.map(fr, 0, 4, 0, 45); squash = p.map(fr, 0, 4, 1, 1.6); stretch = 1 / squash; }

    var sc = SP_SCALE * 0.55;
    p.push(); p.translate(0, bobY); p.scale(squash, stretch); p.noStroke();

    p.fill(0, 0, 0, 55); p.ellipse(2 * sc, -48 * sc, 32 * sc, 72 * sc);
    p.fill(col[0], col[1], col[2]); p.rect(-13 * sc, -60 * sc, 26 * sc, 36 * sc, 5);
    p.fill(acc[0], acc[1], acc[2]); p.ellipse(0, -74 * sc, 24 * sc, 26 * sc);
    p.fill(col[0] * 0.35, col[1] * 0.35, col[2] * 0.35); p.ellipse(0, -86 * sc, 20 * sc, 14 * sc);
    p.fill(255); p.ellipse(-5 * sc, -74 * sc, 5 * sc, 5 * sc); p.ellipse(5 * sc, -74 * sc, 5 * sc, 5 * sc);
    p.fill(10, 5, 30); p.ellipse(-5 * sc, -74 * sc, 2.5 * sc, 3.5 * sc); p.ellipse(5 * sc, -74 * sc, 2.5 * sc, 3.5 * sc);
    p.fill(col[0], col[1], col[2]);
    var la = animName.indexOf('Attack') === 0 ? -limbA * 18 : limbA * 16;
    var ra = animName.indexOf('Attack') === 0 ? limbA * 28 : -limbA * 16;
    p.rect(-24 * sc, (-50 + la) * sc, 9 * sc, 26 * sc, 4);
    p.rect(15 * sc, (-50 + ra) * sc, 9 * sc, 26 * sc, 4);
    var ll = (animName === 'Walk' || animName === 'Run') ? limbA * 18 : 0;
    var rl = (animName === 'Walk' || animName === 'Run') ? -limbA * 18 : 0;
    p.rect(-11 * sc, (-26 + ll) * sc, 10 * sc, 25 * sc, 4);
    p.rect(1 * sc, (-26 + rl) * sc, 10 * sc, 25 * sc, 4);

    if (animName.indexOf('Attack') === 0 && (fr === 2 || fr === 3)) {
      p.fill(acc[0], acc[1], acc[2], 160); p.ellipse(32 * sc, -50 * sc, 28 * sc, 18 * sc);
      p.fill(255, 255, 255, 100); p.ellipse(38 * sc, -50 * sc, 16 * sc, 10 * sc);
    }
    p.pop();
  }

  // ─── Efeitos de hit ─────────────────────────────────────────
  function spawnHit(x, y, type) { hitEffects.push({ x: x, y: y, type: type, life: 30, maxLife: 30 }); }

  // OPT: push/pop fora do loop, operações de fill agrupadas por tipo
  function drawHitEffects() {
    p.push(); p.noStroke(); p.textAlign(p.CENTER, p.CENTER);
    var toRemove = [];
    for (var i = 0; i < hitEffects.length; i++) {
      var e = hitEffects[i];
      e.life--;
      if (e.life <= 0) { toRemove.push(i); continue; }
      var progress = 1 - e.life / e.maxLife;
      var alpha = p.map(e.life, 0, e.maxLife, 0, 255);
      var sz = p.map(progress, 0, 1, 8, 55);

      p.push(); p.translate(e.x, e.y);
      if (e.type === 'HIT') {
        p.fill(255, 220, 0, alpha);
        for (var r = 0; r < 8; r++) {
          var ang = (r / 8) * p.TWO_PI + p.frameCount * 0.3;
          var radius = sz * (r % 2 === 0 ? 1 : 0.45);
          p.ellipse(Math.cos(ang) * radius, Math.sin(ang) * radius, 7, 7);
        }
        p.fill(255, 100, 0, alpha); p.ellipse(0, 0, sz * 0.5, sz * 0.5);
        if (e.life > 12) {
          p.fill(255, 255, 0, alpha); p.textFont('monospace'); p.textStyle(p.BOLD);
          p.textSize(15); p.text('HIT!', 0, -sz * 0.9);
        }
      } else if (e.type === 'BLOCK') {
        p.fill(60, 180, 255, alpha);
        for (var r2 = 0; r2 < 6; r2++) {
          var ang2 = (r2 / 6) * p.TWO_PI;
          p.ellipse(Math.cos(ang2) * sz * 0.7, Math.sin(ang2) * sz * 0.7, 9, 9);
        }
        p.fill(0, 100, 255, alpha * 0.5); p.ellipse(0, 0, sz * 0.8, sz * 0.8);
        if (e.life > 12) {
          p.fill(100, 220, 255, alpha); p.textFont('monospace'); p.textStyle(p.BOLD);
          p.textSize(13); p.text('BLOCK!', 0, -sz * 0.9);
        }
      } else if (e.type === 'CRIT') {
        p.fill(255, 50, 0, alpha); p.ellipse(0, 0, sz, sz);
        p.fill(255, 200, 0, alpha * 0.8); p.ellipse(0, 0, sz * 0.5, sz * 0.5);
        if (e.life > 12) {
          p.fill(255, 80, 0, alpha); p.textFont('monospace'); p.textStyle(p.BOLD);
          p.textSize(18); p.text('CRIT!!', 0, -sz);
        }
      }
      p.pop();
    }
    p.pop();
    // Remove expirados de trás para frente (não altera índices)
    for (var ri = toRemove.length - 1; ri >= 0; ri--) hitEffects.splice(toRemove[ri], 1);
  }

  // ─── Round Overlay  —  MK11: letras grandes, ouro, sem ruído ──
  function drawRoundOverlay() {
    p.push();

    // Fade preto progressivo
    var a = Math.min(roundOverTimer * 5, 200);
    p.fill(0, 0, 0, a); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H);

    if (roundOverTimer < 20) { p.pop(); return; }

    var progress = Math.min((roundOverTimer - 20) / 16, 1);

    p.textFont('monospace'); p.textAlign(p.CENTER, p.CENTER);

    // Linha ouro acima e abaixo do texto
    var lineAlpha = progress * 180;
    p.stroke(180, 140, 50, lineAlpha); p.strokeWeight(1);
    p.line(CX - 280, CY - 48, CX + 280, CY - 48);
    p.line(CX - 280, CY + 48, CX + 280, CY + 48);

    // Nome do vencedor — branco, caixa alta
    p.noStroke();
    var winName = '';
    if (roundWinner === 'P1') winName = fighter1 ? fighter1.charData.name : 'P1';
    else if (roundWinner === 'P2') winName = fighter2 ? fighter2.charData.name : 'P2';

    if (roundWinner === 'DRAW') {
      p.fill(190, 150, 55);
      p.textStyle(p.BOLD); p.textSize(52);
      p.text('EMPATE', CX, CY - 6);
    } else {
      p.fill(240, 240, 240);
      p.textStyle(p.BOLD); p.textSize(46);
      p.text(winName, CX, CY - 8);
      p.fill(180, 140, 50);
      p.textStyle(p.NORMAL); p.textSize(14);
      p.text('V E N C E U', CX, CY + 26);
    }

    // "FINISH HIM" piscante
    if (Math.floor(p.frameCount / 22) % 2 === 0 && roundOverTimer > 50) {
      p.fill(180, 140, 50, 200);
      p.textStyle(p.BOLD); p.textSize(16);
      p.text('F I N I S H   H I M !', CX, CY + 75);
    }

    p.pop();
  }

  // ════════════════════════════════════════════════════════════
  //  GAME OVER  —  MK11: tipografia limpa, ouro, fundo preto
  // ════════════════════════════════════════════════════════════
  function drawGameOver() {
    p.background(0);
    drawMenuBG();

    p.push();
    p.textFont('monospace'); p.textAlign(p.CENTER, p.CENTER); p.noStroke();

    // Faixas laterais ouro
    p.fill(180, 140, 50);
    p.rect(0, 0, 4, CANVAS_H); p.rect(CANVAS_W - 4, 0, 4, CANVAS_H);

    // Linha ouro decorativa
    p.stroke(180, 140, 50, 120); p.strokeWeight(1);
    p.line(CX - 200, CY - 80, CX + 200, CY - 80);

    // "GAME OVER" — branco, enorme
    p.noStroke(); p.fill(255); p.textStyle(p.BOLD); p.textSize(58);
    p.text('GAME OVER', CX, CY - 32);

    // Linha ouro decorativa baixo
    p.stroke(180, 140, 50, 120); p.strokeWeight(1);
    p.line(CX - 200, CY + 8, CX + 200, CY + 8);

    // Resultado
    p.noStroke();
    if (roundWinner && roundWinner !== 'DRAW') {
      var winName = roundWinner === 'P1'
        ? (fighter1 ? fighter1.charData.name : 'P1')
        : (fighter2 ? fighter2.charData.name : 'P2');
      var pLabel = roundWinner === 'P1' ? 'JOGADOR 1' : 'JOGADOR 2';
      p.fill(180, 140, 50); p.textStyle(p.NORMAL); p.textSize(11);
      p.text(pLabel, CX, CY + 28);
      p.fill(210, 210, 210); p.textStyle(p.BOLD); p.textSize(20);
      p.text(winName + '  VENCEU', CX, CY + 46);
    } else if (roundWinner === 'DRAW') {
      p.fill(180, 140, 50); p.textStyle(p.BOLD); p.textSize(20);
      p.text('EMPATE', CX, CY + 36);
    }

    // Hint reiniciar — pisca
    if (Math.floor(p.frameCount / 28) % 2 === 0) {
      p.fill(80, 80, 80); p.textStyle(p.NORMAL); p.textSize(10);
      p.text('START  —  JOGAR NOVAMENTE', CX, CY + 90);
    }
    p.fill(40, 40, 40); p.textSize(9);
    p.text('B  —  MENU PRINCIPAL', CX, CY + 108);
    p.pop();

    var gp1 = getGamepad(0), gp2 = getGamepad(1);
    if (padBtn(gp1, PAD.START) || padBtn(gp2, PAD.START) || p.keyIsDown(13)) startFight();
    if (gpCancel(gp1) || gpCancel(gp2) || p.keyIsDown(88)) {
      STATE = 'MENU'; cd.menu = 20;
      if (!SFX.isMenuMusicPlaying()) SFX.startMenuMusic();       // ← garante que está tocando
    }
  }

  // ════════════════════════════════════════════════════════════
  //  FIGHTER LOGIC
  // ════════════════════════════════════════════════════════════
  function makeFighter(playerNum, charData, sx, sy) {
    return {
      playerNum: playerNum, charData: charData,
      x: sx, y: sy, vx: 0, vy: 0,
      hp: 100, maxHp: 100, stamina: 100, maxStamina: 100,
      state: 'IDLE', facing: playerNum === 1 ? 1 : -1,
      frame: 0, frameTick: 0,
      attackCooldown: 0, hurtCooldown: 0, invincible: 0,
      shieldActive: false, attackHit: false,
      onGround: true, combo: 0, comboTimer: 0,
    };
  }

  function setState(f, newState) {
    if (f.state === newState) return;  // sem mudança — não reinicia o frame
    f.state = newState;
    f.frame = 0;
    f.frameTick = 0;
  }

  function updateFighter(f, opp, gpIdx) {
    var gp = getGamepad(gpIdx);
    f.attackCooldown = Math.max(0, f.attackCooldown - 1);
    f.hurtCooldown = Math.max(0, f.hurtCooldown - 1);
    f.invincible = Math.max(0, f.invincible - 1);
    f.comboTimer = Math.max(0, f.comboTimer - 1);
    if (f.comboTimer === 0) f.combo = 0;
    if (f.state !== 'SHIELD') f.stamina = Math.min(f.maxStamina, f.stamina + 0.18);
    if (f.state === 'DEAD') return;

    var K = f.playerNum === 1
      ? { L: 65, R: 68, U: 87, D: 83, a1: 90, a2: 88, a3: 67, sh: 86, ju: 71, ru: 82 }
      : { L: 37, R: 39, U: 38, D: 40, a1: 188, a2: 190, a3: 191, sh: 186, ju: 222, ru: 82 };

    var left = p.keyIsDown(K.L) || gpLeft(gp);
    var right = p.keyIsDown(K.R) || gpRight(gp);
    var jumpK = p.keyIsDown(K.U) || gpUp(gp);
    var runK = p.keyIsDown(K.ru) || padBtn(gp, 5); // R = teclado | RB = gamepad (botão 5)
    var atk1 = p.keyIsDown(K.a1) || padBtn(gp, PAD.Y);
    var atk2 = p.keyIsDown(K.a2) || padBtn(gp, PAD.X);
    var atk3 = p.keyIsDown(K.a3) || padBtn(gp, PAD.B);
    var shield = p.keyIsDown(K.sh) || padBtn(gp, PAD.A) || padBtn(gp, PAD.SELECT);

    var inAtk = f.state.indexOf('ATTACK') === 0;
    var inHurt = f.state === 'HURT';

    // Escudo
    if (shield && f.onGround && !inAtk && !inHurt) {
      setState(f, 'SHIELD'); f.shieldActive = true; f.vx = 0;
      f.stamina = Math.max(0, f.stamina - 0.35);
      if (f.stamina <= 0) { f.shieldActive = false; setState(f, 'IDLE'); }
      phys(f); return;
    } else { f.shieldActive = false; }

    // Ataques
    if (!inAtk && !inHurt && f.attackCooldown <= 0 && f.onGround) {
      var atType = atk1 ? 'ATTACK_1' : atk2 ? 'ATTACK_2' : atk3 ? 'ATTACK_3' : null;
      if (atType) {
        setState(f, atType);
        f.attackHit = false; f.vx = 0;
        f.stamina = Math.max(0, f.stamina - 14);
        phys(f); return;
      }
    }

    // Hit detection no meio da animacao
    if (inAtk) {
      var def2 = getAnim(f, STATE_TO_ANIM[f.state]);
      if (def2 && !def2.loop) {
        var hitFrame = Math.floor(def2.frames / 2);
        if (f.frame >= hitFrame && !f.attackHit) {
          if (Math.abs(f.x - opp.x) < 115) dealDamage(f, opp);
        }
      }
      phys(f); return;
    }

    if (inHurt) { phys(f); return; }

    // Pulo
    if (jumpK && f.onGround) {
      f.vy = -15; f.onGround = false;
      setState(f, 'JUMP');
      f.stamina = Math.max(0, f.stamina - 8);
    }

    // Movimento
    var spd = runK ? 5.8 : 3.8;  // Run = mais rápido que Walk
    if (left && right) { f.vx = 0; }
    else if (left) { f.vx = -spd; f.facing = -1; if (f.onGround) setState(f, runK ? 'RUN' : 'WALK'); }
    else if (right) { f.vx = spd; f.facing = 1; if (f.onGround) setState(f, runK ? 'RUN' : 'WALK'); }
    else { f.vx = 0; if (f.onGround && !inAtk && !inHurt) setState(f, 'IDLE'); }

    if (f.state === 'IDLE') f.facing = opp.x > f.x ? 1 : -1;
    phys(f);
  }

  function phys(f) {
    f.vy += 0.75;
    f.x += f.vx; f.y += f.vy;
    if (f.y >= GROUND_Y) {
      f.y = GROUND_Y; f.vy = 0; f.onGround = true;
      if (f.state === 'JUMP') setState(f, 'IDLE');
    }
    f.x = p.constrain(f.x, 40, CANVAS_W - 40);
  }

  function dealDamage(attacker, target) {
    attacker.attackHit = true;
    var isCrit = Math.random() < 0.12;
    var dmg = (10 + Math.random() * 10) * (isCrit ? 1.8 : 1);

    if (target.shieldActive && target.stamina > 0) {
      dmg = 2; target.stamina = Math.max(0, target.stamina - 22);
      spawnHit(target.x, target.y - 80, 'BLOCK');
      SFX.block();
    } else {
      target.hp = Math.max(0, target.hp - dmg);
      target.hurtCooldown = 22;
      setState(target, 'HURT');
      target.vx = attacker.facing * 5;
      screenShake = isCrit ? 10 : 6;
      spawnHit(target.x, target.y - 100, isCrit ? 'CRIT' : 'HIT');
      // Dispara efeitos visuais no HUD (sparks + flash da barra)
      hudOnHit(target.playerNum, isCrit);
      if (isCrit) SFX.crit(); else SFX.hit();
      attacker.combo = (attacker.combo || 0) + 1;
      attacker.comboTimer = 90;
      spawnComboFX(attacker);
      if (target.hp <= 0) {
        target.hp = 0; setState(target, 'DEAD');
        SFX.dead();
        endRound();
      }
    }
    attacker.attackCooldown = 28;
  }

  function endRound() {
    if (roundOver) return;
    roundOver = true;
    if (!fighter1 || !fighter2) return;
    if (fighter1.hp <= 0 && fighter2.hp <= 0) roundWinner = 'DRAW';
    else if (fighter1.hp <= 0) roundWinner = 'P2';
    else if (fighter2.hp <= 0) roundWinner = 'P1';
    else roundWinner = fighter1.hp > fighter2.hp ? 'P1' : fighter2.hp > fighter1.hp ? 'P2' : 'DRAW';
    // Para a música (fade out) antes do som de vitória
    SFX.stopFightMusic();
    if (roundWinner !== 'DRAW') setTimeout(function () { SFX.roundWin(); }, 400);
    setTimeout(function() { SFX.startMenuMusic(); }, 1200);
  }

  function animFighter(f) {
    if (!f) return;
    var animName = STATE_TO_ANIM[f.state] || 'Idle';
    var def = getAnim(f, animName);
    f.frameTick++;
    var tpf = Math.max(1, Math.floor(60 / def.fps));
    if (f.frameTick >= tpf) {
      f.frameTick = 0; f.frame++;
      if (f.frame >= def.frames) {
        if (def.loop) { f.frame = 0; }
        else {
          f.frame = def.frames - 1;
          if (f.state.indexOf('ATTACK') === 0 || f.state === 'HURT') {
            setState(f, 'IDLE'); f.attackCooldown = 14;
          }
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  //  UI HELPERS
  // ════════════════════════════════════════════════════════════
  function drawCharFigure(ch, cx, cy, size) {
    if (!ch || !ch.col || !ch.acc) return;
    var col = ch.col, acc = ch.acc;
    p.push(); p.noStroke();
    p.fill(col[0] * 0.18, col[1] * 0.18, col[2] * 0.18, 100);
    p.ellipse(cx, cy + size * 0.95, size * 0.72, size * 0.18);
    p.fill(col[0], col[1], col[2]);
    p.rect(cx - size * 0.2, cy - size * 0.04, size * 0.4, size * 0.5, 4);
    p.fill(acc[0], acc[1], acc[2]);
    p.ellipse(cx, cy - size * 0.32, size * 0.38, size * 0.4);
    p.fill(col[0] * 0.35, col[1] * 0.35, col[2] * 0.35);
    p.ellipse(cx, cy - size * 0.52, size * 0.3, size * 0.18);
    p.fill(col[0], col[1], col[2]);
    p.rect(cx - size * 0.32, cy - size * 0.08, size * 0.12, size * 0.38, 3);
    p.rect(cx + size * 0.2, cy - size * 0.08, size * 0.12, size * 0.38, 3);
    p.rect(cx - size * 0.18, cy + size * 0.44, size * 0.16, size * 0.42, 3);
    p.rect(cx + size * 0.02, cy + size * 0.44, size * 0.16, size * 0.42, 3);
    p.pop();
  }

  // ── Recorta e desenha um frame de spritesheet ────────────────
  // img     : p5.Image do spritesheet (frames lado a lado)
  // frameIdx: índice do frame (0 = primeiro)
  // fw/fh   : largura/altura de cada frame no spritesheet (FRAME_W / FRAME_H)
  // dx/dy   : posição de destino (canto superior esquerdo)
  // dw/dh   : tamanho de destino (escala o frame)
  function drawSpriteFrame(img, frameIdx, fw, fh, dx, dy, dw, dh) {
    if (!img || img.width < 2) return false;
    var sx = frameIdx * fw;
    var sy = 0;
    // Garante que o frame existe no spritesheet
    if (sx + fw > img.width) sx = 0;
    p.drawingContext.drawImage(
      img.canvas || img.elt || img,
      sx, sy, fw, fh,   // source rect
      dx, dy, dw, dh    // dest rect
    );
    return true;
  }

  // cx = centro horizontal do painel
  function drawPlayerPanel(cx, y, pNum, charIdx, ready) {
    charIdx = safeIdx(charIdx);
    var ch = CHARS[charIdx];
    if (!ch || !ch.col || !ch.acc) return;
    var pcol = pNum === 1 ? [25, 75, 255] : [255, 45, 25];
    var w = 220, h = 72;
    var px = cx - w / 2;  // borda esquerda real do painel
    p.push();
    p.fill(pcol[0] * 0.1, pcol[1] * 0.1, pcol[2] * 0.1);
    p.stroke(pcol[0], pcol[1], pcol[2]); p.strokeWeight(1.5);
    p.rect(px, y, w, h, 8);
    p.noStroke();
    // Figura à esquerda — sprite real ou fallback geométrico
    var idleSpr = sprites[ch.folder] && sprites[ch.folder]['Idle'];
    var sprSize = 52; // tamanho do sprite no painel (px)
    if (!idleSpr || !drawSpriteFrame(idleSpr, 0, FRAME_W, FRAME_H,
        px + 4, y + (h - sprSize) * 0.5, sprSize, sprSize)) {
      drawCharFigure(ch, px + 30, y + 36, 28);
    }
    // Texto à direita da figura
    p.fill(255); p.textFont('monospace'); p.textStyle(p.BOLD);
    p.textSize(12); p.textAlign(p.LEFT, p.CENTER);
    p.text('P' + pNum + ': ' + ch.name, px + 62, y + 18);
    p.fill(ch.acc[0], ch.acc[1], ch.acc[2]); p.textSize(9); p.textStyle(p.NORMAL);
    p.text(ch.elem, px + 62, y + 33);
    if (ready) {
      p.fill(0, 190, 75, 220); p.noStroke(); p.rect(px + 62, y + 46, 90, 16, 4);
      p.fill(0, 30, 0); p.textStyle(p.BOLD); p.textSize(9); p.textAlign(p.CENTER, p.CENTER);
      p.text('PRONTO!', px + 107, y + 54);
    } else {
      p.fill(75); p.textStyle(p.NORMAL); p.textSize(8); p.textAlign(p.CENTER, p.CENTER);
      p.text('Pressione A', px + 107, y + 54);
    }
    p.pop();
  }

  function drawBadge(x, y, label, col) {
    p.push(); p.fill(col[0], col[1], col[2]); p.noStroke(); p.rect(x, y, 28, 14, 3);
    p.fill(255); p.textFont(GAME_FONT); p.textStyle(p.BOLD);
    p.textSize(7); p.textAlign(p.CENTER, p.CENTER); p.text(label, x + 14, y + 7);
    p.pop();
  }

  function drawFooter(hint) {
    p.push();
    p.fill(0, 0, 0, 160); p.noStroke(); p.rect(0, CANVAS_H - 26, CANVAS_W, 26);
    p.fill(52); p.textFont(GAME_FONT); p.textStyle(p.NORMAL);
    p.textSize(7); p.textAlign(p.CENTER, p.CENTER);
    p.text(hint, CX, CANVAS_H - 13);
    p.pop();
  }

  // ════════════════════════════════════════════════════════════
  //  GAMEPAD HELPERS
  // ════════════════════════════════════════════════════════════
  function getGamepad(idx) {
    var gps = navigator.getGamepads ? navigator.getGamepads() : [];
    return gps[idx] || null;
  }
  function gpAny() {
    for (var i = 0; i < 4; i++) { var g = getGamepad(i); if (g) return g; } return null;
  }
  function padBtn(gp, idx) {
    if (!gp || !gp.buttons || idx >= gp.buttons.length) return false;
    return gp.buttons[idx].pressed;
  }
  function padBtnAny(gp, indices) {
    if (!gp || !gp.buttons) return false;
    for (var i = 0; i < indices.length; i++) {
      var idx = indices[i];
      if (idx < gp.buttons.length && gp.buttons[idx].pressed) return true;
    }
    return false;
  }
  function padAxis(gp, ax) {
    if (!gp || !gp.axes || ax >= gp.axes.length) return 0;
    return gp.axes[ax];
  }

  // Direcoes — DPad digital (12-15), eixo analogico, hat switch
  function gpLeft(gp) { return padBtn(gp, PAD.LEFT) || padAxis(gp, PAD.AXIS_X) < -0.5 || padAxis(gp, PAD.HAT_X) < -0.5; }
  function gpRight(gp) { return padBtn(gp, PAD.RIGHT) || padAxis(gp, PAD.AXIS_X) > 0.5 || padAxis(gp, PAD.HAT_X) > 0.5; }
  function gpUp(gp) { return padBtn(gp, PAD.UP) || padAxis(gp, PAD.AXIS_Y) < -0.5 || padAxis(gp, PAD.HAT_Y) < -0.5; }
  function gpDown(gp) { return padBtn(gp, PAD.DOWN) || padAxis(gp, PAD.AXIS_Y) > 0.5 || padAxis(gp, PAD.HAT_Y) > 0.5; }

  // CONFIRMAR: testa botoes 0,1,2,3 (face) + 9 (START)
  // Knup KP-3124 pode reportar A como qualquer um desses dependendo do driver
  function gpConfirm(gp) {
    return padBtnAny(gp, [0, 1, 2, 3, 9]);
  }
  // CANCELAR: botao 1 ou 3
  function gpCancel(gp) {
    return padBtnAny(gp, [1, 3]);
  }

  // SELECT+START para sair (segurado 1s)
  var quitHold = 0;
  function checkGlobalQuit() {
    var triggered = false;
    for (var i = 0; i < 4; i++) {
      var gp = getGamepad(i);
      if (gp && padBtn(gp, PAD.SELECT) && padBtn(gp, PAD.START)) { triggered = true; break; }
    }
    if (triggered) {
      quitHold++;
      var ratio = Math.min(quitHold / 60, 1);
      p.push();
      p.fill(0, 0, 0, 200); p.noStroke(); p.rect(0, CANVAS_H - 38, CANVAS_W, 38);
      p.fill(255, 60, 0); p.textFont('monospace'); p.textSize(13);
      p.textAlign(p.CENTER, p.CENTER); p.noStroke();
      p.text('SEGURE SELECT+START PARA SAIR...', CX, CANVAS_H - 20);
      p.fill(255, 80, 0); p.noStroke(); p.rect(0, CANVAS_H - 5, CANVAS_W * ratio, 5);
      p.pop();
      if (quitHold >= 60) quitApp();
    } else { quitHold = 0; }
  }

  // FPS overlay
  function drawFPSOverlay() {
    if (!IS_ELECTRON) return;
    p.push();
    p.fill(0, 0, 0, 160); p.noStroke(); p.rect(4, 4, 95, 16);
    p.fill(0, 220, 80); p.textFont('monospace'); p.textSize(9);
    p.textAlign(p.LEFT, p.TOP);
    p.text('FPS ' + p.frameRate().toFixed(0) + '  ' + CANVAS_W + 'x' + CANVAS_H, 8, 6);
    p.textAlign(p.CENTER, p.CENTER);
    p.pop();
  }

  // Tecla Tab = toggle debug gamepad
  p.keyPressed = function () {
    if (p.keyCode === 9) { showPadDebug = !showPadDebug; return false; }
  };

  // Debug gamepad — mostra indices reais dos botoes
  function drawPadDebug() {
    p.push();
    p.fill(0, 0, 0, 215); p.noStroke();
    p.rect(4, 24, 290, CANVAS_H * 0.46);
    p.fill(0, 255, 100); p.textFont('monospace'); p.textSize(9); p.textAlign(p.LEFT, p.TOP);
    p.text('GAMEPAD DEBUG  (Tab = fechar)', 8, 28);
    var dy = 44;
    for (var gi = 0; gi < 2; gi++) {
      var gp = getGamepad(gi);
      if (!gp) { p.fill(120); p.text('GP' + gi + ': nao conectado', 8, dy); dy += 14; continue; }
      p.fill(255, 220, 0); p.text('GP' + gi + ': ' + gp.id.slice(0, 30), 8, dy); dy += 13;
      var pressed = [];
      for (var b = 0; b < gp.buttons.length; b++) { if (gp.buttons[b].pressed) pressed.push(b); }
      p.fill(200); p.text('  Botoes pressionados: [' + pressed.join(',') + ']', 8, dy); dy += 13;
      var axStr = '';
      for (var ax = 0; ax < Math.min(gp.axes.length, 8); ax++) { axStr += ax + '=' + gp.axes[ax].toFixed(2) + ' '; }
      p.fill(160); p.text('  Eixos: ' + axStr, 8, dy); dy += 16;
    }
    p.pop();
  }

  window.addEventListener('gamepadconnected', function (e) {
    console.log('[SK] Controle conectado:', e.gamepad.id, '| Index:', e.gamepad.index, '| Botoes:', e.gamepad.buttons.length, '| Eixos:', e.gamepad.axes.length);
    console.log('[SK] DICA: Pressione Tab no jogo para ver os indices dos botoes em tempo real');
  });
  window.addEventListener('gamepaddisconnected', function (e) {
    console.log('[SK] Controle desconectado:', e.gamepad.id);
  });

}); // end p5