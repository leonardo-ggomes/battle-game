/**
 * setup.js — Baixa dependências locais para o Shadow Kombat rodar offline.
 * Execute UMA VEZ antes do npm start:   node setup.js
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const LIB_DIR = path.join(__dirname, 'lib');
if (!fs.existsSync(LIB_DIR)) { fs.mkdirSync(LIB_DIR, { recursive: true }); }

// ── Arquivos a baixar ──────────────────────────────────────────
const DOWNLOADS = [
  {
    name: 'P5.js',
    url:  'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js',
    dest: path.join(LIB_DIR, 'p5.min.js'),
  },
  {
    name: 'Press Start 2P (fonte gamificada)',
    url:  'https://fonts.gstatic.com/s/pressstart2p/v15/e3t4euO8T-267oIAQAu6jDQyK3nRivN04w.woff2',
    dest: path.join(LIB_DIR, 'PressStart2P.woff2'),
  },
];

// ── Download com seguimento de redirecionamentos ───────────────
function download(url, dest, cb) {
  if (fs.existsSync(dest)) {
    var kb = (fs.statSync(dest).size / 1024).toFixed(0);
    console.log('  ✅ Já existe (' + kb + ' KB): ' + path.basename(dest));
    return cb(null);
  }

  console.log('  ⬇️  Baixando: ' + url);
  var file = fs.createWriteStream(dest);
  var mod  = url.startsWith('https') ? https : http;

  mod.get(url, function(res) {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      file.close();
      fs.unlinkSync(dest);
      return download(res.headers.location, dest, cb);
    }
    if (res.statusCode !== 200) {
      file.close(); fs.unlink(dest, function(){});
      return cb(new Error('HTTP ' + res.statusCode));
    }
    res.pipe(file);
    file.on('finish', function() {
      file.close(function() {
        var kb = (fs.statSync(dest).size / 1024).toFixed(0);
        console.log('  ✅ Salvo (' + kb + ' KB): ' + path.basename(dest));
        cb(null);
      });
    });
  }).on('error', function(err) {
    fs.unlink(dest, function(){});
    cb(err);
  });
}

// ── Executa downloads em sequência ────────────────────────────
var idx = 0;
function next() {
  if (idx >= DOWNLOADS.length) {
    console.log('\n✅ Tudo pronto! Execute:  npm start\n');
    console.log('📁 Estrutura de pastas esperada:');
    console.log('   lib/');
    console.log('     p5.min.js');
    console.log('     PressStart2P.woff2');
    console.log('   sounds/            ← opcional: coloque WAVs reais aqui');
    console.log('     menu_move.wav    menu_confirm.wav  menu_back.wav');
    console.log('     fight_hit.wav    fight_block.wav   fight_crit.wav');
    console.log('     fight_dead.wav   round_start.wav   round_win.wav');
    console.log('   sprites/');
    console.log('     character_1/');
    console.log('       portrait.png   ← imagem do personagem na seleção');
    console.log('       Idle.png  Walk.png  Attack_1.png  ...');
    return;
  }
  var dl = DOWNLOADS[idx++];
  console.log('\n[' + idx + '/' + DOWNLOADS.length + '] ' + dl.name);
  download(dl.url, dl.dest, function(err) {
    if (err) { console.error('  ❌ Falha:', err.message); }
    next();
  });
}

console.log('\n🎮 Shadow Kombat — Setup\n');
next();