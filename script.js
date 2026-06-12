/* =========================================================
   2048 小游戏 — 无 Firebase 版
   ========================================================= */

// =========================================================
// 1. DOM 快捷引用
// =========================================================
const $ = id => document.getElementById(id);
const scoreEl          = $('score');
const bestScoreEl      = $('best-score');
const gridBg           = $('grid-background');
const tileContainer    = $('tile-container');
const gameContainer    = $('game-container');
const gameOverOverlay  = $('game-over-overlay');
const finalScore       = $('final-score');
const winOverlay       = $('win-overlay');
const newGameBtn       = $('new-game-btn');
const restartBtn       = $('restart-btn');
const continueBtn      = $('continue-btn');
const musicBtn         = $('music-btn');
const shareBtn         = $('share-btn');
const toastEl          = $('toast');

// =========================================================
// 2. iOS / 移动端视口高度适配
// =========================================================
function fixMobileViewport() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
fixMobileViewport();
window.addEventListener('resize', fixMobileViewport);

let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    if (game && game.cells && game.cells.length > 0) {
      game._render();
    }
  }, 200);
});

// =========================================================
// 3. 音效管理器 (Web Audio API)
// =========================================================
const SoundFX = {
  _ctx: null,
  _ready: false,

  init() {
    if (this._ready) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this._ctx = new C();
      this._ready = true;
    } catch (_) {}
  },

  _ensure() {
    if (!this._ready) this.init();
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
  },

  move() {
    try {
      this._ensure();
      const o = this._ctx.createOscillator();
      const g = this._ctx.createGain();
      o.connect(g); g.connect(this._ctx.destination);
      o.type = 'triangle'; o.frequency.value = 200;
      g.gain.setValueAtTime(0.5, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.06);
      o.start(); o.stop(this._ctx.currentTime + 0.06);
    } catch (_) {}
  },

  merge() {
    try {
      this._ensure();
      const o = this._ctx.createOscillator();
      const g = this._ctx.createGain();
      o.connect(g); g.connect(this._ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(300, this._ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(600, this._ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.5, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.15);
      o.start(); o.stop(this._ctx.currentTime + 0.15);
    } catch (_) {}
  },

  gameOver() {
    try {
      this._ensure();
      const o = this._ctx.createOscillator();
      const g = this._ctx.createGain();
      o.connect(g); g.connect(this._ctx.destination);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(400, this._ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(80, this._ctx.currentTime + 0.6);
      g.gain.setValueAtTime(0.35, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.6);
      o.start(); o.stop(this._ctx.currentTime + 0.6);
    } catch (_) {}
  },

  win() {
    try {
      this._ensure();
      [523, 659, 784].forEach((freq, i) => {
        const o = this._ctx.createOscillator();
        const g = this._ctx.createGain();
        o.connect(g); g.connect(this._ctx.destination);
        o.type = 'sine'; o.frequency.value = freq;
        const t = this._ctx.currentTime + i * 0.15;
        g.gain.setValueAtTime(0.4, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.start(t); o.stop(t + 0.35);
      });
    } catch (_) {}
  }
};

// =========================================================
// 4. 背景音乐
// =========================================================
const bgMusic = new Audio('./gin120_ed2-mr-raindrop.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.15;
let bgMusicPlaying = false;

function initAudio() {
  SoundFX.init();
}

function startBgMusic() {
  if (bgMusicPlaying) return;
  bgMusicPlaying = true;
  bgMusic.play().catch(() => {});
  musicBtn.textContent = '🔊 背景音乐';
  musicBtn.classList.remove('music-off');
  musicBtn.classList.add('music-on');
}

function toggleMusic() {
  SoundFX.init();

  if (!bgMusicPlaying) {
    bgMusicPlaying = true;
    bgMusic.play().catch(() => {});
    musicBtn.textContent = '🔊 背景音乐';
    musicBtn.classList.remove('music-off');
    musicBtn.classList.add('music-on');
  } else if (bgMusic.paused) {
    bgMusic.play().catch(() => {});
    musicBtn.textContent = '🔊 背景音乐';
    musicBtn.classList.remove('music-off');
    musicBtn.classList.add('music-on');
  } else {
    bgMusic.pause();
    musicBtn.textContent = '🔇 背景音乐';
    musicBtn.classList.remove('music-on');
    musicBtn.classList.add('music-off');
  }
}

function firstGameInteraction() {
  startBgMusic();
  document.removeEventListener('keydown', firstGameInteraction);
  document.removeEventListener('touchstart', firstGameInteraction);
}
document.addEventListener('keydown', firstGameInteraction);
document.addEventListener('touchstart', firstGameInteraction);

// =========================================================
// 5. Toast 提示
// =========================================================
let toastTimer = null;
function showToast(msg) {
  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  toastEl.style.animation = 'none';
  void toastEl.offsetHeight;
  toastEl.style.animation = '';
  toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2000);
}

// =========================================================
// 6. 方块身份 Cell
// =========================================================
let _nextCellId = 0;
class Cell {
  constructor(value) {
    this.id = _nextCellId++;
    this.value = value;
  }
}

// =========================================================
// 7. 2048 游戏
// =========================================================
const SIZE = 4;
const TILE_CLASSES = [
  '', 'tile-2', 'tile-4', 'tile-8', 'tile-16', 'tile-32', 'tile-64',
  'tile-128', 'tile-256', 'tile-512', 'tile-1024', 'tile-2048'
];

class Game2048 {
  constructor() {
    this.cells      = [];
    this.score      = 0;
    this.over       = false;
    this.won        = false;
    this.keepGoing  = false;
    this._tileEls   = new Map();
    this._pendingAnim = false;
    this._gridBgCreated = false;
  }

  _createGridBg() {
    if (this._gridBgCreated) return;
    gridBg.innerHTML = '';
    gridBg.style.display = 'grid';
    gridBg.style.gridTemplateColumns = `repeat(${SIZE}, 1fr)`;
    gridBg.style.gap = '3%';
    gridBg.style.width = '100%';
    gridBg.style.height = '100%';
    for (let i = 0; i < SIZE * SIZE; i++) {
      const c = document.createElement('div');
      c.style.background = 'rgba(238, 228, 218, 0.35)';
      c.style.borderRadius = '4px';
      gridBg.appendChild(c);
    }
    this._gridBgCreated = true;
  }

  _cellLayout(col, row) {
    const size = gameContainer.clientWidth;
    const pad  = size * 0.02;
    const gap  = size * 0.03;
    const cell = (size - pad * 2 - gap * (SIZE - 1)) / SIZE;
    return {
      x: pad + col * (cell + gap),
      y: pad + row * (cell + gap),
      size: cell
    };
  }

  start() {
    this._createGridBg();
    this._tileEls.forEach(el => el.remove());
    this._tileEls.clear();
    tileContainer.innerHTML = '';

    this.cells = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    this.score = 0;
    this.over = false;
    this.won = false;
    this.keepGoing = false;
    this._pendingAnim = false;
    this.hideOverlays();

    const t1 = this._addRandomTile();
    const t2 = this._addRandomTile();
    this._render({ newIds: [t1.id, t2.id] });
    this.updateScore();
  }

  _addRandomTile() {
    const empty = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (this.cells[r][c] === null) empty.push([r, c]);
    if (empty.length === 0) return null;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    const val = Math.random() < 0.9 ? 2 : 4;
    const cell = new Cell(val);
    this.cells[r][c] = cell;
    return cell;
  }

  _emptyCount() {
    let n = 0;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (this.cells[r][c] === null) n++;
    return n;
  }

  _rotate() {
    const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        g[c][SIZE - 1 - r] = this.cells[r][c];
    this.cells = g;
  }

  _moveLeft() {
    let moved = false;
    const victims = [];
    const doubled = [];

    for (let r = 0; r < SIZE; r++) {
      let row = this.cells[r].filter(c => c !== null);
      for (let i = 0; i < row.length - 1; i++) {
        if (row[i].value === row[i + 1].value) {
          victims.push(row[i + 1].id);
          doubled.push(row[i].id);
          row[i].value *= 2;
          this.score += row[i].value;
          row.splice(i + 1, 1);
          moved = true;
        }
      }
      while (row.length < SIZE) row.push(null);
      for (let c = 0; c < SIZE; c++)
        if (this.cells[r][c] !== row[c]) { moved = true; break; }
      this.cells[r] = row;
    }
    return { moved, victims, doubled };
  }

  move(direction) {
    if (this.over || this.won || this._pendingAnim) return;

    const oldGrid = this.cells.map(row => row.map(c => c ? c.value : 0));

    const rotMap  = { left: 0, up: 3, right: 2, down: 1 };
    const rot     = rotMap[direction];
    const backRot = (SIZE - rot) % SIZE;

    for (let i = 0; i < rot; i++) this._rotate();
    const result = this._moveLeft();
    for (let i = 0; i < backRot; i++) this._rotate();

    if (!result.moved) return;

    const mergedPositions = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const ov = oldGrid[r][c];
        const cell = this.cells[r][c];
        if (ov > 0 && cell && cell.value === ov * 2) {
          mergedPositions.push([r, c]);
        }
      }
    }

    const newCell = this._addRandomTile();

    this._render({
      victims: result.victims,
      doubledIds: result.doubled,
      newIds: newCell ? [newCell.id] : []
    });

    if (result.doubled.length > 0) {
      SoundFX.merge();
    } else {
      SoundFX.move();
    }

    this.updateScore();

    this._pendingAnim = true;
    setTimeout(() => {
      this._pendingAnim = false;
      this.checkGameOver();
      if (!this.keepGoing) this.checkWin();
    }, 130);
  }

  checkGameOver() {
    if (this._emptyCount() > 0) return;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const v = this.cells[r][c].value;
        if ((c < SIZE - 1 && this.cells[r][c + 1] && this.cells[r][c + 1].value === v) ||
            (r < SIZE - 1 && this.cells[r + 1][c] && this.cells[r + 1][c].value === v)) {
          return;
        }
      }
    this.over = true;
    finalScore.textContent = `得分：${this.score}`;
    gameOverOverlay.classList.remove('hidden');
    SoundFX.gameOver();
  }

  checkWin() {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (this.cells[r][c] && this.cells[r][c].value === 2048) {
          this.won = true;
          winOverlay.classList.remove('hidden');
          SoundFX.win();
          return;
        }
  }

  updateScore() {
    scoreEl.textContent = this.score;
    const best = Math.max(this.score,
      parseInt(localStorage.getItem('2048_best') || '0'));
    localStorage.setItem('2048_best', best);
    bestScoreEl.textContent = best;
  }

  hideOverlays() {
    gameOverOverlay.classList.add('hidden');
    winOverlay.classList.add('hidden');
  }

  // =====================================================
  // 8. 渲染
  // =====================================================
  _render(opt = {}) {
    const victims    = new Set(opt.victims    || []);
    const doubledIds = new Set(opt.doubledIds || []);
    const newIds     = new Set(opt.newIds     || []);

    const activeIds = new Set();
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (this.cells[r][c]) activeIds.add(this.cells[r][c].id);

    for (const [id, el] of this._tileEls) {
      if (!activeIds.has(id)) {
        el.remove();
        this._tileEls.delete(id);
      }
    }

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = this.cells[r][c];
        if (cell === null) continue;

        const pos = this._cellLayout(c, r);
        let el    = this._tileEls.get(cell.id);

        if (!el) {
          el = document.createElement('div');
          el.style.position    = 'absolute';
          el.style.top         = '0';
          el.style.left        = '0';
          el.style.display     = 'flex';
          el.style.alignItems  = 'center';
          el.style.justifyContent = 'center';
          el.style.fontWeight  = '700';
          el.style.borderRadius = '4px';
          el.style.zIndex      = '1';
          tileContainer.appendChild(el);
          this._tileEls.set(cell.id, el);
        }

        el.style.width  = pos.size + 'px';
        el.style.height = pos.size + 'px';
        el.style.left   = pos.x + 'px';
        el.style.top    = pos.y + 'px';

        el.dataset.value = cell.value;
        el.textContent   = cell.value;
        el.className     = `tile ${this._tileColorClass(cell.value)}`;
        if (cell.value >= 1024) el.classList.add('tile-extra');

        if (victims.has(cell.id)) el.classList.add('tile-vanish');
        if (doubledIds.has(cell.id)) el.classList.add('tile-merged');
        if (newIds.has(cell.id)) el.classList.add('tile-new');
      }
    }
  }

  _tileColorClass(val) {
    const idx = Math.floor(Math.log2(val));
    return idx < TILE_CLASSES.length ? TILE_CLASSES[idx] : 'tile-super';
  }
}

// =========================================================
// 9. 键盘控制
// =========================================================
document.addEventListener('keydown', e => {
  const map = {
    ArrowLeft: 'left', ArrowUp: 'up',
    ArrowRight: 'right', ArrowDown: 'down'
  };
  const dir = map[e.key];
  if (dir) {
    e.preventDefault();
    SoundFX._ensure();
    game.move(dir);
  }
});

// =========================================================
// 10. 移动端触控
// =========================================================
let touchStartX = 0, touchStartY = 0;
let touchLastX = 0, touchLastY = 0;
let touchMoved = false;

gameContainer.addEventListener('touchstart', e => {
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchLastX = t.clientX;
  touchLastY = t.clientY;
  touchMoved = false;
}, { passive: true });

gameContainer.addEventListener('touchmove', e => {
  const t = e.touches[0];
  touchLastX = t.clientX;
  touchLastY = t.clientY;
  touchMoved = true;
  e.preventDefault();
}, { passive: false });

gameContainer.addEventListener('touchend', e => {
  if (!touchMoved) return;

  const t  = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;

  let dir;
  if (Math.abs(dx) > Math.abs(dy)) {
    dir = dx > 0 ? 'right' : 'left';
  } else {
    dir = dy > 0 ? 'down' : 'up';
  }
  SoundFX._ensure();
  game.move(dir);
}, { passive: true });

// =========================================================
// 11. 按钮事件
// =========================================================
const restart = () => {
  game.hideOverlays();
  game.start();
};
newGameBtn.addEventListener('click', restart);
restartBtn.addEventListener('click', restart);

continueBtn.addEventListener('click', () => {
  winOverlay.classList.add('hidden');
  game.keepGoing = true;
  game.won = false;
});

musicBtn.addEventListener('click', toggleMusic);

shareBtn.addEventListener('click', () => {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    showToast('✅ 网址已复制在剪切板中！');
  }).catch(() => {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('✅ 网址已复制在剪切板中！');
  });
});

// =========================================================
// 12. 启动游戏
// =========================================================
const game = new Game2048();
game.start();
SoundFX.init();
