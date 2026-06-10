/**
 * 扫雷 Minesweeper
 * 经典 Windows 扫雷游戏的纯前端实现，支持桌面端和移动端。
 * 使用 IIFE 封装以隔离作用域，启用严格模式以捕获常见错误。
 */
(function() {
    'use strict';

    // ==================== 游戏模式配置 ====================

    /** 桌面端棋盘配置：行数、列数、雷数 */
    const MODES = {
        beginner:     { rows: 9,  cols: 9,  mines: 10 },
        intermediate: { rows: 16, cols: 16, mines: 40 },
        expert:       { rows: 16, cols: 30, mines: 99 }
    };

    /**
     * 移动端棋盘配置：与桌面端保持相同的雷密度，
     * 但调整为竖屏友好的比例（行数 > 列数），格子更大，便于手指点击。
     */
    const MOBILE_MODES = {
        beginner:     { rows: 9,  cols: 9,  mines: 10 },
        intermediate: { rows: 15, cols: 12, mines: 28 },
        expert:       { rows: 17, cols: 12, mines: 42 }
    };

    // ==================== 游戏状态变量 ====================

    /** 当前选中模式标识：'beginner' | 'intermediate' | 'expert' */
    let currentMode = 'beginner';
    /** 棋盘行 / 列数（运行时根据模式和平台确定） */
    let rows, cols, totalMines;
    /** 棋盘二维数组，每个元素为 { mine, revealed, flagged, questioned, adjacentMines } */
    let board = [];
    /** 雷位置索引集合，用于 O(1) 判断某个格子是否为雷 */
    let minePositions = new Set();
    /**
     * 游戏结束状态：false 进行中，'win' 胜利，'lose' 失败
     * 使用字符串而非布尔值，以便区分胜利和失败两种结束状态
     */
    let gameOver = false;
    /** 计时器是否已启动（首次点击后置为 true） */
    let gameStarted = false;
    /** 是否仍为首次点击（首次点击后才布雷，确保不会开局踩雷） */
    let firstClick = true;
    /** setInterval 返回的定时器 ID，用于停止计时 */
    let timerInterval = null;
    /** 已流逝秒数，上限 999 */
    let elapsedSeconds = 0;
    /** 移动端轻触标记模式开关 */
    let flagMode = false;
    /** 透视模式开关（显示所有未翻开雷的位置） */
    let cheatMode = false;
    /** 快速标记模式开关（双击数字格自动标记/翻开四周雷） */
    let quickFlagMode = false;
    /** 剩余待标记雷数 = totalMines - 已标记数 */
    let remainingMines = 0;
    /** 已翻开格子数，用于胜利判定 */
    let revealedCount = 0;
    /** 移动端长按定时器（400ms 触发标记） */
    let longPressTimer = null;
    /** 当前触摸序列是否已触发长按标记 */
    let longPressTriggered = false;
    /** 是否为移动端设备（触碰 + 粗指针） */
    let isMobile = false;
    /** 上次轻触数字格的时间戳，用于移动端双击检测 */
    let lastTapTime = 0;
    /** 上次轻触数字格的行 / 列坐标 */
    let lastTapRow = -1;
    let lastTapCol = -1;
    /** 移动端双击判定间隔（毫秒），两次轻触间隔 < 300ms 视为双击 */
    const DOUBLE_TAP_DELAY = 300;

    // ==================== DOM 元素引用 ====================

    const boardEl = document.getElementById('board');
    const mineCounterEl = document.getElementById('mineCounter');
    const timerEl = document.getElementById('timer');
    const faceBtn = document.getElementById('faceBtn');
    const flagToggle = document.getElementById('flagToggle');
    const mobileControls = document.getElementById('mobileControls');
    const cheatBtn = document.getElementById('cheatBtn');
    const quickFlagBtn = document.getElementById('quickFlagBtn');

    // ==================== 平台与初始化 ====================

    /**
     * 检测当前设备是否为移动端，并控制移动端专属控件的显隐。
     * 判断依据：支持触摸事件 || 多点触控 || 粗指针媒体查询。
     */
    function detectMobile() {
        isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
        mobileControls.style.display = isMobile ? 'flex' : 'none';
    }

    /**
     * 初始化 / 重置游戏状态。
     * 根据平台（桌面 / 移动）选择对应模式配置，清空棋盘数据和所有 UI 状态。
     */
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
        cheatMode = false;
        quickFlagMode = false;
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
        cheatBtn.classList.remove('active');
        quickFlagBtn.classList.remove('active');

        // 构建空的棋盘二维数组（格子默认未翻开、未标记、非雷）
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

    // ==================== 格子尺寸自适应 ====================

    /**
     * 根据窗口宽度和当前列数动态计算格子尺寸。
     * 移动端优先保证横向填满屏幕（减 10px padding），
     * 桌面端留出侧边空间。同时根据格子大小自动调整字号，
     * 确保大格子配大字体、小格子配小字体。
     */
    function updateCellSize() {
        var maxWidth, cellSize, cellFontSize;

        if (isMobile) {
            maxWidth = window.innerWidth - 10;
            cellSize = Math.min(48, maxWidth / cols);
        } else {
            maxWidth = window.innerWidth - 40;
            cellSize = Math.min(36, Math.floor((maxWidth - 200) / cols));
            cellSize = Math.max(28, cellSize);
        }

        // 根据格子大小分档设置字号
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

    // ==================== 布雷逻辑 ====================

    /**
     * 首次点击后生成雷的位置。
     * 以点击格 (safeR, safeC) 为中心的 3×3 区域为安全区，不会布雷，
     * 确保玩家首次点击绝不会踩雷。
     * 使用 Fisher-Yates 洗牌算法从可用位置中随机选取雷位。
     *
     * @param {number} safeR - 安全区中心行
     * @param {number} safeC - 安全区中心列
     */
    function placeMines(safeR, safeC) {
        // 构建安全区索引集合（3×3 区域）
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
        // 雷数不能超过可用格子数（极端小棋盘时防止死循环）
        const minesToPlace = Math.min(totalMines, availableCells);

        // 收集所有可布雷的位置索引
        const available = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!safeCells.has(r * cols + c)) {
                    available.push(r * cols + c);
                }
            }
        }

        // Fisher-Yates 洗牌，只洗前 minesToPlace 个即可
        for (let i = available.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [available[i], available[j]] = [available[j], available[i]];
        }

        // 放置前 minesToPlace 个位置为雷
        for (let i = 0; i < minesToPlace; i++) {
            const idx = available[i];
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            board[r][c].mine = true;
            minePositions.add(idx);
        }

        // 预计算所有非雷格子周围雷的数量
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!board[r][c].mine) {
                    board[r][c].adjacentMines = countAdjacentMines(r, c);
                }
            }
        }
    }

    /**
     * 统计指定格子周围 8 格中的雷数。
     */
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

    // ==================== 棋盘渲染 ====================

    /**
     * 全量渲染棋盘 DOM。
     * 使用 CSS Grid 布局排列格子，遍历所有行列创建 cell 元素并绑定事件。
     * 使用闭包 (IIFE) 捕获当前的 row/col 值，避免异步事件回调中的变量引用问题。
     */
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

                    // cell-content 作为内容层，pointer-events: none 避免干扰事件
                    var content = document.createElement('span');
                    content.className = 'cell-content';
                    cell.appendChild(content);

                    // 桌面端事件
                    cell.addEventListener('click', function(e) { handleClick(row, col, e); });
                    cell.addEventListener('contextmenu', function(e) { handleRightClick(row, col, e); });

                    // 移动端触摸事件（passive: false 允许 preventDefault 阻止默认行为）
                    if (isMobile) {
                        cell.addEventListener('touchstart', function(e) { handleTouchStart(row, col, e); }, { passive: false });
                        cell.addEventListener('touchend', function(e) { handleTouchEnd(row, col, e); }, { passive: false });
                        cell.addEventListener('touchmove', function(e) { handleTouchMove(e); }, { passive: false });
                    }

                    // 按下 / 松开 / 离开时改变表情：😊 → 😮（仅对未翻开的格子）
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
        updateCheatMode();
    }

    /**
     * 透视模式：显示 / 隐藏所有未翻开的雷。
     * 遍历整个棋盘，为未翻开的雷格添加/移除 cheat-mine 类名和 💣 内容。
     * 关闭透视时恢复原有显示（旗帜 / 游戏结束时的雷 / 空白）。
     */
    function updateCheatMode() {
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                var cellEl = getCellEl(r, c);
                if (!cellEl) continue;
                if (board[r][c].mine && !board[r][c].revealed) {
                    if (cheatMode) {
                        cellEl.classList.add('cheat-mine');
                        cellEl.querySelector('.cell-content').textContent = '💣';
                    } else {
                        cellEl.classList.remove('cheat-mine');
                        var content = cellEl.querySelector('.cell-content');
                        if (board[r][c].flagged) {
                            content.textContent = '🚩';
                        } else if (gameOver && board[r][c].mine) {
                            content.textContent = '💣';
                        } else {
                            content.textContent = '';
                        }
                    }
                }
            }
        }
    }

    /**
     * 根据行列获取棋盘 DOM 元素（一维索引映射）。
     * 避免使用 querySelector，直接通过 children 数组索引访问，性能更优。
     */
    function getCellEl(r, c) {
        return boardEl.children[r * cols + c];
    }

    /** 遍历所有格子并更新其视觉显示 */
    function updateAllCells() {
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                updateCellDisplay(r, c);
            }
        }
    }

    /**
     * 更新单个格子的 CSS 类名和文字内容。
     * 处理以下状态：
     *   - 已翻开：雷（爆炸/普通）、数字（带颜色类名 n1~n8）、空
     *   - 未翻开：旗帜 🚩、问号 ❓、空白
     *   - 游戏结束后：错误标记显示 ❌
     */
    function updateCellDisplay(r, c) {
        const cell = getCellEl(r, c);
        if (!cell) return;

        const data = board[r][c];
        const content = cell.querySelector('.cell-content');

        // 重置类名，保留基础 cell 类
        cell.className = 'cell';

        if (data.revealed) {
            cell.classList.add('revealed');
            if (data.mine) {
                // 区分爆炸的雷（红色背景）和普通翻开的雷（粉色背景）
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
                // 游戏结束时，标记了非雷格 → 错误标记
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

    // ==================== 事件处理 ====================

    /**
     * 桌面端 / 移动端 click 事件统一入口。
     * 移动端已翻开的数字格交由 handleTouchEnd 处理双击，此处跳过。
     * 桌面端快速标记模式下，点击数字格调用 quickFlag 智能处理。
     */
    function handleClick(r, c, e) {
        if (gameOver) return;
        if (isMobile && flagMode) {
            toggleFlag(r, c);
            return;
        }
        if (isMobile && longPressTriggered) return;

        // 移动端已翻开数字格：交给 handleTouchEnd 处理双击逻辑
        if (isMobile && board[r][c].revealed && board[r][c].adjacentMines > 0) {
            return;
        }

        // 桌面端快速标记模式：智能标记/翻开
        if (quickFlagMode && board[r][c].revealed && board[r][c].adjacentMines > 0) {
            quickFlag(r, c);
            return;
        }

        reveal(r, c);
    }

    /** 桌面端右键：标记旗帜（阻止默认右键菜单）*/
    function handleRightClick(r, c, e) {
        e.preventDefault();
        if (gameOver) return;
        toggleFlag(r, c);
    }

    /**
     * 移动端触摸开始：启动 400ms 长按定时器，超时后触发标记。
     * 按下未翻开格子时显示 😮 表情。
     */
    function handleTouchStart(r, c, e) {
        if (gameOver) return;
        longPressTriggered = false;

        if (!board[r][c].revealed && !board[r][c].flagged) {
            faceBtn.textContent = '😮';
        }

        longPressTimer = setTimeout(() => {
            longPressTriggered = true;
            toggleFlag(r, c);
            // 长按触发时触觉反馈
            if (navigator.vibrate) {
                navigator.vibrate(15);
            }
        }, 400);

        e.preventDefault();
    }

    /**
     * 移动端触摸结束：核心交互逻辑。
     * 处理流程：
     *   1. 游戏结束 → 显示表情并重置
     *   2. 长按已触发 → 跳过
     *   3. 标记模式 → 切换标记
     *   4. 已翻开的数字格 → 双击检测（chord / quickFlag）
     *   5. 其他 → 翻开格子
     */
    function handleTouchEnd(r, c, e) {
        if (gameOver) {
            faceBtn.textContent = gameOver === 'win' ? '😎' : '😵';
            lastTapTime = 0;
            return;
        }

        faceBtn.textContent = '😊';

        // 取消长按定时器（触摸结束在 400ms 内）
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        // 长按已触发标记，不处理后续逻辑
        if (longPressTriggered) {
            longPressTriggered = false;
            lastTapTime = 0;
            e.preventDefault();
            return;
        }

        // 标记模式：轻触直接标记
        if (flagMode) {
            toggleFlag(r, c);
            lastTapTime = 0;
            e.preventDefault();
            return;
        }

        // 已翻开的数字格：双击 chord / quickFlag，单击高亮
        if (board[r][c].revealed && board[r][c].adjacentMines > 0) {
            var now = Date.now();
            if (r === lastTapRow && c === lastTapCol && (now - lastTapTime) < DOUBLE_TAP_DELAY) {
                // 双击：清除高亮，执行 chord 或 quickFlag
                clearChordHighlight();
                if (quickFlagMode) {
                    quickFlag(r, c);
                } else {
                    chord(r, c);
                }
                lastTapTime = 0;
            } else {
                // 单击：清除旧高亮，高亮当前数字格周围未翻开格子
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

    /**
     * 移动端触摸移动：取消长按并恢复表情。
     * 防止轻微滑动误触发长按标记。
     */
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

    /**
     * 切换单个格子的标记状态：无标记 → 🚩 → ❓ → 无标记（循环）。
     * 已翻开的格子不可标记。
     */
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

    /**
     * 快速标记 / 智能操作。
     * 当双击数字格时，根据相邻格状态自动决策：
     *   1. 四周已标记的雷数 > 数字 → 标记错误，放弃（返回 false）
     *   2. 已标记数 == 数字 → 执行 Chord（翻开剩余安全格子）
     *   3. 未翻开数 + 已标记数 == 数字 → 所有未翻开格子是雷，全部标记
     *   4. 其他情况 → 无法确定，不操作（返回 false）
     *
     * @returns {boolean} 是否执行了有效操作
     */
    function quickFlag(r, c) {
        var num = board[r][c].adjacentMines;
        if (num <= 0) return false;

        var dr = [-1, -1, -1, 0, 0, 1, 1, 1];
        var dc = [-1, 0, 1, -1, 1, -1, 0, 1];
        var candidates = [];
        var flaggedCount = 0;

        // 收集四周未翻开且未标记的格子，统计已标记数
        for (var i = 0; i < 8; i++) {
            var nr = r + dr[i];
            var nc = c + dc[i];
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                if (board[nr][nc].revealed) continue;
                if (board[nr][nc].flagged) {
                    flaggedCount++;
                } else {
                    candidates.push({ r: nr, c: nc });
                }
            }
        }

        if (flaggedCount > num) return false;
        // 已标记数 == 数字 → 翻开剩余安全格
        if (flaggedCount === num) {
            chord(r, c);
            return true;
        }
        if (candidates.length === 0) return false;
        // 未翻开 + 已标记 == 数字 → 全部标记为雷
        if (candidates.length + flaggedCount !== num) return false;

        for (var j = 0; j < candidates.length; j++) {
            var cell = candidates[j];
            board[cell.r][cell.c].flagged = true;
            board[cell.r][cell.c].questioned = false;
            remainingMines--;
            updateCellDisplay(cell.r, cell.c);
        }

        updateMineCounter();
        return true;
    }

    /**
     * 翻开指定格子。
     * 首次点击时触发布雷（确保安全）并启动计时器。
     * 踩雷时调用 loseGame，否则泛洪填充并检查胜利。
     */
    function reveal(r, c) {
        if (board[r][c].revealed || board[r][c].flagged) return;
        if (gameOver) return;

        // 首次点击：布雷 + 启动计时器
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

    /**
     * 泛洪填充：递归翻开格子。
     * 若当前格周围雷数 > 0，仅翻开当前格；
     * 若周围雷数 = 0，递归翻开周围 8 格（自动扩展空白区域）。
     * 已翻开、已标记、是雷的格子跳过。
     */
    function floodFill(r, c) {
        if (r < 0 || r >= rows || c < 0 || c >= cols) return;
        if (board[r][c].revealed || board[r][c].flagged || board[r][c].mine) return;

        board[r][c].revealed = true;
        board[r][c].questioned = false;
        revealedCount++;
        updateCellDisplay(r, c);

        // 空白格（adjacentMines = 0）：递归展开四周
        if (board[r][c].adjacentMines === 0) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    floodFill(r + dr, c + dc);
                }
            }
        }
    }

    /**
     * Chord 操作：双击数字格后，若四周标记数 == 数字，
     * 翻开四周所有未标记的非雷格。若存在标记错误则会踩雷并失败。
     */
    function chord(r, c) {
        if (!board[r][c].revealed || board[r][c].adjacentMines === 0) return;
        if (gameOver) return;

        // 统计四周已标记数量
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

        // 标记数匹配时才执行
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
                                // 标记了错误的格子 → 踩雷
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

    /**
     * 高亮数字格周围所有未翻开且未标记的格子（蓝色边框）。
     * 用于移动端单击数字格时的视觉反馈。
     */
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

    /** 清除所有格子的双击高亮状态 */
    function clearChordHighlight() {
        var highlighted = boardEl.querySelectorAll('.chord-highlight');
        for (var i = 0; i < highlighted.length; i++) {
            highlighted[i].classList.remove('chord-highlight');
        }
    }

    // ==================== 游戏结束逻辑 ====================

    /**
     * 失败处理（直接点击到雷）。
     * 爆炸格红色标记，翻开所有未标记的雷，高亮错误标记。
     *
     * @param {number} clickedR - 踩雷位置行
     * @param {number} clickedC - 踩雷位置列
     */
    function loseGame(clickedR, clickedC) {
        stopTimer();
        faceBtn.textContent = '😵';

        // 爆炸格特殊样式
        const cellEl = getCellEl(clickedR, clickedC);
        if (cellEl) {
            cellEl.classList.add('mine-exploded');
            cellEl.querySelector('.cell-content').textContent = '💣';
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (r === clickedR && c === clickedC) continue;
                // 翻开未标记的雷
                if (board[r][c].mine && !board[r][c].flagged) {
                    board[r][c].revealed = true;
                    updateCellDisplay(r, c);
                }
                // 高亮标记了非雷格（错误标记）
                if (!board[r][c].mine && board[r][c].flagged) {
                    updateCellDisplay(r, c);
                }
            }
        }
    }

    /**
     * 失败处理（Chord 时踩雷）。
     * 与 loseGame 的区别：不需要单独处理爆炸格（可能多处踩雷），
     * 统一翻开所有未标记的雷。
     */
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

    /**
     * 胜利检测：已翻开数 == 总格子数 - 总雷数 时获胜。
     * 胜利后自动为剩余雷格插旗，显示 😎 表情。
     */
    function checkWin() {
        const totalCells = rows * cols;
        if (revealedCount === totalCells - totalMines) {
            gameOver = 'win';
            stopTimer();
            faceBtn.textContent = '😎';

            // 自动标记所有未标记的雷
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

    // ==================== 计时器 ====================

    /** 启动计时器（每秒 +1，上限 999） */
    function startTimer() {
        elapsedSeconds = 0;
        updateTimer();
        timerInterval = setInterval(() => {
            elapsedSeconds++;
            if (elapsedSeconds > 999) elapsedSeconds = 999;
            updateTimer();
        }, 1000);
    }

    /** 停止计时器并清除定时器 */
    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    /** 更新计时器显示（3 位前补零） */
    function updateTimer() {
        timerEl.textContent = String(elapsedSeconds).padStart(3, '0');
    }

    /** 更新剩余雷数显示（最小为 0，3 位前补零） */
    function updateMineCounter() {
        const val = remainingMines < 0 ? 0 : remainingMines;
        mineCounterEl.textContent = String(val).padStart(3, '0');
    }

    // ==================== UI 操作 ====================

    /** 重新开始游戏 */
    function resetGame() {
        stopTimer();
        initGame();
    }

    /**
     * 切换游戏难度模式。
     * 更新按钮激活状态后重新初始化棋盘与格子尺寸。
     */
    function switchMode(mode) {
        if (currentMode === mode) return;
        currentMode = mode;
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        initGame();
        updateCellSize();
    }

    // ==================== 事件绑定 ====================

    /** 移动端标记模式切换按钮 */
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

    /** 透视模式按钮：游戏结束时自动关闭 */
    cheatBtn.addEventListener('click', function() {
        if (gameOver) cheatMode = false;
        else cheatMode = !cheatMode;
        cheatBtn.classList.toggle('active', cheatMode);
        updateCheatMode();
    });

    /** 快速标记模式按钮 */
    quickFlagBtn.addEventListener('click', function() {
        quickFlagMode = !quickFlagMode;
        quickFlagBtn.classList.toggle('active', quickFlagMode);
    });

    /** 点击笑脸重置游戏 */
    faceBtn.addEventListener('click', resetGame);

    /** 难度选择按钮 */
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchMode(btn.dataset.mode);
        });
    });

    /** 桌面端双击数字格 → Chord 操作 */
    boardEl.addEventListener('dblclick', (e) => {
        if (gameOver) return;
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        chord(r, c);
    });

    /** 窗口尺寸变化时重新计算格子大小 */
    window.addEventListener('resize', () => {
        updateCellSize();
    });

    /** 页面加载完成后检测平台并初始化 */
    document.addEventListener('DOMContentLoaded', () => {
        detectMobile();
        initGame();
    });

    // 立即执行初始化（防止 DOMContentLoaded 已触发）
    detectMobile();
    initGame();
})();