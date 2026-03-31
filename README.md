# KOMBAT ARENA — Documentação Técnica

## Visão Geral
Jogo de luta 2D completo, estilo Mortal Kombat, desenvolvido para rodar no ElectronJS em Raspberry Pi.
Tecnologias: HTML5 Canvas, JavaScript puro (ES6+), p5-inspired rendering, CSS3.

---

## Arquitetura Modular

```
index.html
├── CONFIG          → Constantes globais do jogo
├── GAMEPAD         → Mapeamento de controle/gamepad
├── CHARACTERS[]    → Definição de todos os personagens
├── InputManager    → Gerenciamento de teclado + gamepad
├── ParticleSystem  → Sistema de partículas (faíscas, sangue, etc.)
├── Effects         → Efeitos visuais (shockwave, slash, explosão)
├── Fighter (class) → Lógica e desenho de cada lutador
├── Background      → Renderização procedural do cenário
├── Audio           → Sons sintetizados via Web Audio API
└── Game            → Controller principal (estados, HUD, rounds)
```

---

## Sistema de Controles

### Teclado (Player 1 — WASD)
| Ação        | Tecla |
|-------------|-------|
| Mover esq.  | A     |
| Mover dir.  | D     |
| Pular       | W     |
| Agachar     | S     |
| Soco        | F     |
| Chute       | G     |
| Bloquear    | H     |
| Especial    | V     |

### Teclado (Player 2 — SETAS / NUMPAD)
| Ação        | Tecla        |
|-------------|--------------|
| Mover esq.  | ← / Numpad4  |
| Mover dir.  | → / Numpad6  |
| Pular       | ↑ / Numpad8  |
| Agachar     | ↓ / Numpad5  |
| Soco        | J            |
| Chute       | K            |
| Bloquear    | L            |
| Especial    | M            |

### Gamepad (Standard Layout — PS/Xbox)
| Ação        | Botão        |
|-------------|--------------|
| Mover       | Analógico L / D-Pad |
| Pular       | D-Pad ↑      |
| Agachar     | D-Pad ↓      |
| Soco        | A / X        |
| Chute       | B / Circle   |
| Bloquear    | X / Square   |
| Especial    | Y / Triangle |

---

## Mecânicas do Jogo

### Sistema de Vida e Stamina
- **Vida**: 100 HP por round. Redução visual com indicador de dano (lag bar laranja)
- **Stamina**: Regenera automaticamente. Consome ao atacar e bloquear
- **Especial**: 3 pips, carregam automaticamente ao longo do tempo

### Sistema de Combate
- **Soco leve**: 7 de dano, hitbox menor, mais rápido (18 frames)
- **Chute pesado**: 12 de dano, hitbox maior, mais lento (25 frames)
- **Ataque agachado**: 6 de dano, hitbox baixa
- **Bloqueio**: Reduz dano em 85%, gasta stamina, causa block stun
- **Especial**: 20 de dano, projétil com trail, invencibilidade temporária

### Sistema de Combos
- Janela de combo: 400ms entre hits
- 2+ hits consecutivos exibem texto de combo na tela

### Rounds
- 3 rounds máximo, primeiro a vencer 2 rounds ganha
- Tempo: 99 segundos por round
- Vitória por: vida zerada, tempo esgotado (quem tiver mais vida vence)

---

## Personagens (10 fighters)

| Nome     | Especial              | Força | Vel | Def |
|----------|-----------------------|-------|-----|-----|
| DEV   | Explosão de Sombra    | 7     | 8   | 5   |
| INFERNO  | Rajada de Fogo        | 9     | 6   | 5   |
| GLACIER  | Lança de Gelo         | 7     | 6   | 9   |
| VENOM    | Veneno Ácido          | 8     | 7   | 5   |
| THUNDER  | Descarga Elétrica     | 8     | 9   | 3   |
| REAPER   | Foice da Alma         | 10    | 5   | 5   |
| NOVA     | Explosão Nova         | 7     | 8   | 6   |
| TITAN    | Terremoto             | 10    | 3   | 9   |
| PHANTOM  | Ilusão Dimensional    | 6     | 9   | 6   |
| WARLORD  | Fúria de Guerra       | 9     | 6   | 7   |

---

## Sistema de Efeitos

### ParticleSystem
- Faíscas (spark), círculos (circle), sangue (blood)
- Suporte a glow, gravidade customizada, velocidade e spread
- Pool de partículas com decay automático

### Effects
- `shockwave`: Onda circular expansiva
- `flash`: Brilho radial de impacto
- `slash`: Corte diagonal luminoso
- `explosion`: Explosão com gradiente radial
- `projectile`: Projétil com trail
- `screenShake`: Tremor de câmera com intensidade e duração

### Audio (Web Audio API)
- 100% sintetizado (sem arquivos externos)
- Sons: punch, kick, special, block, announce, jump, land, menuSelect
- Compatível com Raspberry Pi sem dependências

---

## Telas do Jogo

1. **Loading**: Barra de progresso animada, logo com efeito sangue
2. **Character Select**: Grid 5x2, seleção sequencial P1→P2, preview de personagem
3. **HUD de batalha**: Life bars, stamina, pips de especial, timer, rounds ganhos
4. **Round Announce**: Texto animado "ROUND X" / "FIGHT!" / vitória
5. **Victory Screen**: Tabela de ranking com rounds ganhos, dano total, resultado

---

## Performance (Raspberry Pi)

- Renderização em canvas fixo 1280x720, escalado via CSS
- Sem bibliotecas externas (zero dependências)
- Particles com pool size limitado e decay rápido
- Background procedural (sem assets de imagem)
- Audio sintético (sem decodificação de áudio)
- Fontes via Google Fonts (cache local após 1º load)

### Para uso offline no Raspberry (ElectronJS)
Embuta as fontes como base64 ou use fontes do sistema. Exemplo no main.js do Electron:
```js
app.commandLine.appendSwitch('disable-gpu-vsync'); // reduz latência
app.commandLine.appendSwitch('enable-zero-copy');  // melhor performance canvas
```

---

## Estrutura ElectronJS Recomendada

```
kombat-arena/
├── main.js          ← Electron main process
├── package.json
└── renderer/
    └── index.html   ← Este arquivo
```

### main.js mínimo
```js
const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    fullscreen: true,
    webPreferences: { nodeIntegration: false }
  });
  win.loadFile('renderer/index.html');
  win.setMenuBarVisibility(false);
});
```

---

## Extensões Futuras Sugeridas
- Sprites PNG reais em spritesheet (substituir o desenho geométrico)
- Cenários múltiplos com parallax
- Sistema de hi-score persistente (arquivo JSON local via Electron IPC)
- Modo IA (CPU opponent com estados de behavior tree)
- Fatalities / finishing moves
- Músicas por cenário (Web Audio procedural ou arquivos OGG)
