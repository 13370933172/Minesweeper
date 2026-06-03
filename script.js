(function() {
    'use strict';

    const MODES = {
        beginner: { rows: 9, cols: 9, mines: 10 },
        intermediate: { rows: 16, cols: 16, mines: 40 },
        expert: { rows: 16, cols: 30, mines: 99 }
    };

    const MOBILE_MODES = {
        beginner: { rows: 9, cols: 9, mines: 10 },
        intermediate: { rows: 15, cols: 15, mines: 35 },
        expert: { rows: 19, cols: 14, mines: 55 }
    };

    let currentMode = 'beginner';
    let rows, cols, totalMines;
    let board = [];
    let minePositions = new Set();
    let gameOver = false;
    let gameStarted = false;
    let firstClick = true;
    let timerInterval = null;
    let elapsedSeconds = 0;
    let flagMode = false;
    let remainingMines = 0;
    let revealedCount = 0;
    let longPressTimer = null;
    let longPressTriggered = false;
    let isMobile = false;
    let lastTapTime = 0;
    let lastTapRow = -1;
    let lastTapCol = -1;
    const DOUBLE_TAP_DELAY = 300;

    const boardEl = document.getElementById('board');
    const mineCounterEl = document.getElementById('mineCounter');
    const timerEl = document.getElementById('timer');
    const faceBtn = document.getElementById('faceBtn');
    const flagToggle = document.getElementById('flagToggle');
    const mobileControls = document.getElementById('mobileControls');

    function detectMobile() {
        isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
        mobileControls.style.display = isMobile ? 'flex' : 'none';
    }

    function initGame() {
        var mode = isMobile ? MOBILE_MODES[currentMode] : MODES[currentMode];
        rows = mode.rows;
        cols = mode.cols;
        totalMines = mode.mines;
        board = [];
        minePositions = new Set();
        gameOver = false;
        gameStarted = false;
        firstClick = true;
        elapsedSeconds = 0;
        remainingMines = totalMines;
        revealedCount = 0;
        flagMode = false;
        lastTapTime = 0;

        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        updateMineCounter();
        updateTimer();
        faceBtn.textContent = '😊';
        flagToggle.classList.remove('active');
        flagToggle.textContent = '🚩 标记模式';

        for (let r = 0; r < rows; r++) {
            board[r] = [];
            for (let c = 0; c < cols; c++) {
                board[r][c] = {
                    mine: false,
                    revealed: false,
                    flagged: false,
                    questioned: false,
                    adjacentMines: 0
                };
            }
        }

        renderBoard();
        updateCellSize();
    }

    function updateCellSize() {
        var maxWidth, maxHeight, cellSize, cellFontSize;

        if (isMobile) {
            maxWidth = window.innerWidth - 10;
            cellSize = Math.min(48, maxWidth / cols);
        } else {
            maxWidth = window.innerWidth - 40;
            cellSize = Math.min(36, Math.floor((maxWidth - 200) / cols));
            cellSize = Math.max(28, cellSize);
        }

        if (cellSize >= 40) {
            cellFontSize = 18;
        } else if (cellSize >= 30) {
            cellFontSize = 16;
        } else if (cellSize >= 26) {
            cellFontSize = 14;
        } else {
            cellFontSize = 12;
        }

        document.documentElement.style.setProperty('--cell-size', cellSize + 'px');
        document.documentElement.style.setProperty('--cell-font-size', cellFontSize + 'px');
    }

    function placeMines(safeR, safeC) {
        const safeCells = new Set();
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = safeR + dr;
                const nc = safeC + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                    safeCells.add(nr * cols + nc);
                }
            }
        }

        const totalCells = rows * cols;
        const availableCells = totalCells - safeCells.size;
        const minesToPlace = Math.min(totalMines, availableCells);

        const available = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!safeCells.has(r * cols + c)) {
                    available.push(r * cols + c);
                }
            }
        }

        for (let i = available.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [available[i], available[j]] = [available[j], available[i]];
        }

        for (let i = 0; i < minesToPlace; i++) {
            const idx = available[i];
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            board[r][c].mine = true;
            minePositions.add(idx);
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!board[r][c].mine) {
                    board[r][c].adjacentMines = countAdjacentMines(r, c);
                }
            }
        }
    }

    function countAdjacentMines(row, col) {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = row + dr;
                const nc = col + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].mine) {
                    count++;
                }
            }
        }
        return count;
    }

    function renderBoard() {
        boardEl.innerHTML = '';
        boardEl.style.gridTemplateColumns = 'repeat(' + cols + ', var(--cell-size))';
        boardEl.style.gridTemplateRows = 'repeat(' + rows + ', var(--cell-size))';

        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                (function(row, col) {
                    var cell = document.createElement('div');
                    cell.className = 'cell';
                    cell.dataset.row = row;
                    cell.dataset.col = col;

                    var content = document.createElement('span');
                    content.className = 'cell-content';
                    cell.appendChild(content);

                    cell.addEventListener('click', function(e) { handleClick(row, col, e); });
                    cell.addEventListener('contextmenu', function(e) { handleRightClick(row, col, e); });

                    if (isMobile) {
                        cell.addEventListener('touchstart', function(e) { handleTouchStart(row, col, e); }, { passive: false });
                        cell.addEventListener('touchend', function(e) { handleTouchEnd(row, col, e); }, { passive: false });
                        cell.addEventListener('touchmove', function(e) { handleTouchMove(e); }, { passive: false });
                    }

                    cell.addEventListener('mousedown', function() {
                        if (!gameOver && !board[row][col].revealed && !board[row][col].flagged) {
                            faceBtn.textContent = '😮';
                        }
                    });

                    cell.addEventListener('mouseup', function() {
                        if (!gameOver) {
                            faceBtn.textContent = '😊';
                        }
                    });

                    cell.addEventListener('mouseleave', function() {
                        if (!gameOver) {
                            faceBtn.textContent = '😊';
                        }
                    });

                    boardEl.appendChild(cell);
                })(r, c);
            }
        }

        updateAllCells();
    }

    function getCellEl(r, c) {
        return boardEl.children[r * cols + c];
    }

    function updateAllCells() {
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                updateCellDisplay(r, c);
            }
        }
    }

    function updateCellDisplay(r, c) {
        const cell = getCellEl(r, c);
        if (!cell) return;

        const data = board[r][c];
        const content = cell.querySelector('.cell-content');

        cell.className = 'cell';

        if (data.revealed) {
            cell.classList.add('revealed');
            if (data.mine) {
                if (cell.classList.contains('mine-exploded')) {
                    content.textContent = '💣';
                } else {
                    cell.classList.add('mine-revealed');
                    content.textContent = '💣';
                }
            } else if (data.adjacentMines > 0) {
                cell.classList.add('n' + data.adjacentMines);
                content.textContent = data.adjacentMines;
            } else {
                content.textContent = '';
            }
        } else if (data.flagged) {
            if (gameOver && !data.mine) {
                cell.classList.add('flag-wrong');
                content.textContent = '❌';
            } else {
                content.textContent = '🚩';
            }
        } else if (data.questioned) {
            content.textContent = '❓';
        } else {
            content.textContent = '';
        }
    }

    function handleClick(r, c, e) {
        if (gameOver) return;
        if (isMobile && flagMode) {
            toggleFlag(r, c);
            return;
        }
        if (isMobile && longPressTriggered) return;

        reveal(r, c);
    }

    function handleRightClick(r, c, e) {
        e.preventDefault();
        if (gameOver) return;
        toggleFlag(r, c);
    }

    function handleTouchStart(r, c, e) {
        if (gameOver) return;
        longPressTriggered = false;

        if (!board[r][c].revealed && !board[r][c].flagged) {
            faceBtn.textContent = '😮';
        }

        longPressTimer = setTimeout(() => {
            longPressTriggered = true;
            toggleFlag(r, c);
            if (navigator.vibrate) {
                navigator.vibrate(15);
            }
        }, 400);

        e.preventDefault();
    }

    function handleTouchEnd(r, c, e) {
        if (gameOver) {
            faceBtn.textContent = gameOver === 'win' ? '😎' : '😵';
            lastTapTime = 0;
            return;
        }

        faceBtn.textContent = '😊';

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        if (longPressTriggered) {
            longPressTriggered = false;
            lastTapTime = 0;
            e.preventDefault();
            return;
        }

        if (flagMode) {
            toggleFlag(r, c);
            lastTapTime = 0;
            e.preventDefault();
            return;
        }

        if (board[r][c].revealed && board[r][c].adjacentMines > 0) {
            var now = Date.now();
            if (r === lastTapRow && c === lastTapCol && (now - lastTapTime) < DOUBLE_TAP_DELAY) {
                clearChordHighlight();
                chord(r, c);
                lastTapTime = 0;
            } else {
                clearChordHighlight();
                highlightAdjacent(r, c);
                lastTapTime = now;
                lastTapRow = r;
                lastTapCol = c;
            }
        } else {
            clearChordHighlight();
            reveal(r, c);
            lastTapTime = 0;
        }

        longPressTriggered = false;
        e.preventDefault();
    }

    function handleTouchMove(e) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        longPressTriggered = false;
        if (!gameOver) {
            faceBtn.textContent = '😊';
        }
        e.preventDefault();
    }

    function toggleFlag(r, c) {
        if (board[r][c].revealed) return;

        if (board[r][c].flagged) {
            board[r][c].flagged = false;
            board[r][c].questioned = true;
            remainingMines++;
        } else if (board[r][c].questioned) {
            board[r][c].questioned = false;
        } else {
            board[r][c].flagged = true;
            board[r][c].questioned = false;
            remainingMines--;
        }

        updateMineCounter();
        updateCellDisplay(r, c);
    }

    function reveal(r, c) {
        if (board[r][c].revealed || board[r][c].flagged) return;
        if (gameOver) return;

        if (firstClick) {
            firstClick = false;
            placeMines(r, c);
            startTimer();
            gameStarted = true;
        }

        if (board[r][c].mine) {
            gameOver = 'lose';
            loseGame(r, c);
            return;
        }

        floodFill(r, c);
        checkWin();
    }

    function floodFill(r, c) {
        if (r < 0 || r >= rows || c < 0 || c >= cols) return;
        if (board[r][c].revealed || board[r][c].flagged || board[r][c].mine) return;

        board[r][c].revealed = true;
        board[r][c].questioned = false;
        revealedCount++;
        updateCellDisplay(r, c);

        if (board[r][c].adjacentMines === 0) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    floodFill(r + dr, c + dc);
                }
            }
        }
    }

    function chord(r, c) {
        if (!board[r][c].revealed || board[r][c].adjacentMines === 0) return;
        if (gameOver) return;

        var flagCount = 0;
        for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                var nr = r + dr;
                var nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].flagged) {
                    flagCount++;
                }
            }
        }

        if (flagCount === board[r][c].adjacentMines) {
            var hitMine = false;
            for (var dr = -1; dr <= 1; dr++) {
                for (var dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    var nr = r + dr;
                    var nc = c + dc;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                        if (!board[nr][nc].revealed && !board[nr][nc].flagged) {
                            if (board[nr][nc].mine) {
                                hitMine = true;
                                board[nr][nc].revealed = true;
                            } else {
                                floodFill(nr, nc);
                            }
                        }
                    }
                }
            }

            if (hitMine) {
                gameOver = 'lose';
                loseGameAll();
            } else {
                checkWin();
            }
        }
    }

    function highlightAdjacent(r, c) {
        for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                var nr = r + dr;
                var nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !board[nr][nc].revealed && !board[nr][nc].flagged) {
                    var cellEl = getCellEl(nr, nc);
                    if (cellEl) {
                        cellEl.classList.add('chord-highlight');
                    }
                }
            }
        }
    }

    function clearChordHighlight() {
        var highlighted = boardEl.querySelectorAll('.chord-highlight');
        for (var i = 0; i < highlighted.length; i++) {
            highlighted[i].classList.remove('chord-highlight');
        }
    }

    function loseGame(clickedR, clickedC) {
        stopTimer();
        faceBtn.textContent = '😵';

        const cellEl = getCellEl(clickedR, clickedC);
        if (cellEl) {
            cellEl.classList.add('mine-exploded');
            cellEl.querySelector('.cell-content').textContent = '💣';
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (r === clickedR && c === clickedC) continue;
                if (board[r][c].mine && !board[r][c].flagged) {
                    board[r][c].revealed = true;
                    updateCellDisplay(r, c);
                }
                if (!board[r][c].mine && board[r][c].flagged) {
                    updateCellDisplay(r, c);
                }
            }
        }
    }

    function loseGameAll() {
        stopTimer();
        faceBtn.textContent = '😵';

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (board[r][c].mine && !board[r][c].flagged) {
                    board[r][c].revealed = true;
                }
                updateCellDisplay(r, c);
            }
        }
    }

    function checkWin() {
        const totalCells = rows * cols;
        if (revealedCount === totalCells - totalMines) {
            gameOver = 'win';
            stopTimer();
            faceBtn.textContent = '😎';

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (board[r][c].mine && !board[r][c].flagged) {
                        board[r][c].flagged = true;
                        remainingMines--;
                        updateCellDisplay(r, c);
                    }
                }
            }
            updateMineCounter();
        }
    }

    function startTimer() {
        elapsedSeconds = 0;
        updateTimer();
        timerInterval = setInterval(() => {
            elapsedSeconds++;
            if (elapsedSeconds > 999) elapsedSeconds = 999;
            updateTimer();
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function updateTimer() {
        timerEl.textContent = String(elapsedSeconds).padStart(3, '0');
    }

    function updateMineCounter() {
        const val = remainingMines < 0 ? 0 : remainingMines;
        mineCounterEl.textContent = String(val).padStart(3, '0');
    }

    function resetGame() {
        stopTimer();
        initGame();
    }

    function switchMode(mode) {
        if (currentMode === mode) return;
        currentMode = mode;
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        initGame();
        updateCellSize();
    }

    flagToggle.addEventListener('click', () => {
        flagMode = !flagMode;
        if (flagMode) {
            flagToggle.classList.add('active');
            flagToggle.textContent = '🚩 标记中（点击切换）';
        } else {
            flagToggle.classList.remove('active');
            flagToggle.textContent = '🚩 标记模式';
        }
    });

    faceBtn.addEventListener('click', resetGame);

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchMode(btn.dataset.mode);
        });
    });

    boardEl.addEventListener('dblclick', (e) => {
        if (gameOver) return;
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        chord(r, c);
    });

    window.addEventListener('resize', () => {
        updateCellSize();
    });

    document.addEventListener('DOMContentLoaded', () => {
        detectMobile();
        initGame();
    });

    detectMobile();
    initGame();
})();