class GomokuGame {
    constructor() {
        this.canvas = document.getElementById('gameBoard');
        this.ctx = this.canvas.getContext('2d');
        this.socket = null;
        this.isConnected = false;
        
        // Game state
        this.board = Array(15).fill().map(() => Array(15).fill(0));
        this.currentPlayer = 1; // 1: black, 2: white
        this.playerNumber = null;
        this.gameOver = false;
        this.winner = null;
        this.aiMode = false;
        this.localMultiplayerMode = false; // New: local two-player mode
        this.moveHistory = [];
        this.offlineMode = false;
        
        // Canvas settings
        this.cellSize = 40;
        this.boardSize = 15;
        this.margin = 20;
        
        // Animation state
        this.previewStone = null;
        this.animatingStones = [];
        
        this.initializeGame();
        this.setupEventListeners();
        this.connectToServer();
        
        // Start animation loop
        this.animate();
    }

    initializeGame() {
        this.drawBoard();
        this.updateUI();
    }

    setupEventListeners() {
        // Canvas click handler
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', () => this.clearPreview());
        
        // Button handlers
        document.getElementById('newGameBtn').addEventListener('click', () => this.newGame());
        document.getElementById('aiModeBtn').addEventListener('click', () => this.enableAI());
        document.getElementById('localMultiplayerBtn').addEventListener('click', () => this.enableLocalMultiplayer());
        document.getElementById('modalNewGame').addEventListener('click', () => this.closeModalAndNewGame());
    }

    connectToServer() {
        try {
            this.socket = io();
            
            this.socket.on('connect', () => {
                this.isConnected = true;
                this.offlineMode = false;
                this.updateConnectionStatus('Connected', true);
                console.log('Connected to server');
            });

            this.socket.on('disconnect', () => {
                this.isConnected = false;
                this.updateConnectionStatus('Disconnected - Playing Offline', false);
                this.enableOfflineMode();
                console.log('Disconnected from server - enabling offline mode');
            });

            this.socket.on('playerAssigned', (data) => {
                this.playerNumber = data.playerNumber;
                this.board = data.board;
                this.updatePlayerInfo();
                this.updateTurnIndicator(data.isYourTurn);
                this.drawBoard();
            });

            this.socket.on('playerUpdate', (data) => {
                document.getElementById('playersCount').textContent = `Players: ${data.players}/2`;
            });

            this.socket.on('gameStart', (data) => {
                this.showStatus(data.message, 'info');
            });

            this.socket.on('moveUpdate', (data) => {
                this.board[data.row][data.col] = data.player;
                this.currentPlayer = data.currentPlayer;
                this.gameOver = data.gameOver;
                this.winner = data.winner;
                
                this.addMoveToHistory(data.row, data.col, data.player, data.isAI);
                this.animateStone(data.row, data.col, data.player);
                this.updateTurnIndicator(data.currentPlayer === this.playerNumber);
                
                if (data.gameOver) {
                    this.handleGameOver(data.winner);
                }
                
                // Trigger AI move if needed
                if (this.aiMode && data.currentPlayer === 2 && !data.gameOver) {
                    setTimeout(() => {
                        this.socket.emit('aiMove');
                    }, 500);
                }
            });

            this.socket.on('gameOver', (data) => {
                this.handleGameOver(data.winner, data.message);
            });

            this.socket.on('gameReset', (data) => {
                this.resetGame();
                this.board = data.board;
                this.currentPlayer = data.currentPlayer;
                this.drawBoard();
                this.showStatus(data.message, 'info');
            });

            this.socket.on('restoreHistory', (data) => {
                // Restore move history on reconnection
                this.moveHistory = data.moveHistory || [];
                this.displayMoveHistory();
            });

            this.socket.on('aiEnabled', (data) => {
                this.aiMode = true;
                this.playerNumber = 1;
                this.board = data.board;
                this.updatePlayerInfo();
                this.drawBoard();
                this.showStatus(data.message, 'info');
                document.getElementById('aiModeBtn').textContent = 'AI Mode Active';
                document.getElementById('aiModeBtn').disabled = true;
            });

            this.socket.on('gameFull', (data) => {
                this.showStatus(data.message, 'warning');
                this.enableOfflineMode();
            });

            this.socket.on('error', (data) => {
                this.showStatus(data.message, 'error');
            });

        } catch (error) {
            console.log('Failed to connect to server - enabling offline mode');
            this.enableOfflineMode();
        }
    }

    enableOfflineMode() {
        this.offlineMode = true;
        this.playerNumber = 1;
        this.updateConnectionStatus('Offline Mode', false);
        this.updatePlayerInfo();
        this.showStatus('Playing in offline mode - both players can play locally', 'info');
    }

    enableAI() {
        try {
            // Reset any existing game state
            this.resetGameState();
            
            if (this.isConnected && !this.aiMode && !this.localMultiplayerMode) {
                this.socket.emit('enableAI');
            } else {
                this.aiMode = true;
                this.localMultiplayerMode = false;
                this.offlineMode = true;
                this.playerNumber = 1;
                this.resetGame();
                this.updatePlayerInfo();
                this.showStatus('AI mode enabled - You are black stones', 'info');
                this.updateGameModeButtons();
            }
        } catch (error) {
            console.error('Error enabling AI mode:', error);
            this.showStatus('Error switching to AI mode', 'error');
        }
    }

    enableLocalMultiplayer() {
        try {
            // Reset any existing game state
            this.resetGameState();
            
            this.localMultiplayerMode = true;
            this.aiMode = false;
            this.offlineMode = true;
            this.playerNumber = null; // Both players can play
            this.resetGame();
            this.updatePlayerInfo();
            this.showStatus('Local multiplayer mode - Two players on same device', 'info');
            this.updateGameModeButtons();
        } catch (error) {
            console.error('Error enabling local multiplayer mode:', error);
            this.showStatus('Error switching to local multiplayer mode', 'error');
        }
    }

    resetGameState() {
        // Clear any ongoing animations
        this.animatingStones = [];
        this.previewStone = null;
        
        // Clear game state
        this.gameOver = false;
        this.winner = null;
        this.moveHistory = [];
        
        // Clear UI
        const moveList = document.getElementById('moveList');
        if (moveList) {
            moveList.innerHTML = '';
        }
    }

    updateGameModeButtons() {
        const aiBtn = document.getElementById('aiModeBtn');
        const localBtn = document.getElementById('localMultiplayerBtn');
        
        if (this.aiMode) {
            aiBtn.textContent = 'AI Mode Active';
            aiBtn.classList.add('active');
            localBtn.textContent = 'Local Multiplayer';
            localBtn.classList.remove('active');
        } else if (this.localMultiplayerMode) {
            localBtn.textContent = 'Local Mode Active';
            localBtn.classList.add('active');
            aiBtn.textContent = 'Play vs AI';
            aiBtn.classList.remove('active');
        } else {
            aiBtn.textContent = 'Play vs AI';
            aiBtn.classList.remove('active');
            localBtn.textContent = 'Local Multiplayer';
            localBtn.classList.remove('active');
        }
    }

    handleCanvasClick(e) {
        try {
            if (this.gameOver) return;
            
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const { row, col } = this.getGridPosition(x, y);
            
            // Validate coordinates
            if (row === -1 || col === -1 || row < 0 || row >= 15 || col < 0 || col >= 15) {
                return;
            }
            
            // Check if position is already occupied
            if (this.board[row][col] !== 0) {
                return;
            }

            if (this.localMultiplayerMode || this.offlineMode) {
                this.makeOfflineMove(row, col);
            } else if (this.isConnected && this.socket) {
                this.socket.emit('makeMove', { row, col });
            }
        } catch (error) {
            console.error('Error handling canvas click:', error);
        }
    }

    handleMouseMove(e) {
        if (this.gameOver) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const { row, col } = this.getGridPosition(x, y);
        
        if (row !== -1 && col !== -1 && this.board[row][col] === 0) {
            this.previewStone = { row, col, player: this.getCurrentPlayerForPreview() };
        } else {
            this.previewStone = null;
        }
    }

    clearPreview() {
        this.previewStone = null;
    }

    getCurrentPlayerForPreview() {
        if (this.localMultiplayerMode || this.offlineMode) {
            return this.currentPlayer;
        } else if (this.aiMode) {
            return 1; // Player is always black in AI mode
        } else {
            return this.playerNumber;
        }
    }

    makeOfflineMove(row, col) {
        if (this.board[row][col] !== 0) return;
        
        this.board[row][col] = this.currentPlayer;
        this.addMoveToHistory(row, col, this.currentPlayer);
        this.animateStone(row, col, this.currentPlayer);
        
        if (this.checkWin(row, col, this.currentPlayer)) {
            this.handleGameOver(this.currentPlayer);
            return;
        }
        
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        this.updateTurnIndicator(true); // In offline mode, it's always "your turn"
        
        // AI move in offline mode
        if (this.aiMode && this.currentPlayer === 2) {
            setTimeout(() => {
                const aiMove = this.getBestAIMove();
                if (aiMove) {
                    this.board[aiMove.row][aiMove.col] = 2;
                    this.addMoveToHistory(aiMove.row, aiMove.col, 2, true);
                    this.animateStone(aiMove.row, aiMove.col, 2);
                    
                    if (this.checkWin(aiMove.row, aiMove.col, 2)) {
                        this.handleGameOver(2);
                        return;
                    }
                    
                    this.currentPlayer = 1;
                    this.updateTurnIndicator(true);
                }
            }, 500);
        }
    }

    getBestAIMove() {
        const depth = 6; // Professional depth for strong play
        const result = this.negamax(depth, -Infinity, Infinity, 1); // 1 for AI (maximizing player)
        return result.move || this.getStrategicMove();
    }

    getStrategicMove() {
        // If no moves found, choose strategic position
        const center = { row: 7, col: 7 };
        if (this.board[center.row][center.col] === 0) {
            return center;
        }
        
        // Find position near existing stones
        for (let distance = 1; distance <= 3; distance++) {
            for (let row = 0; row < 15; row++) {
                for (let col = 0; col < 15; col++) {
                    if (this.board[row][col] !== 0) {
                        for (let dr = -distance; dr <= distance; dr++) {
                            for (let dc = -distance; dc <= distance; dc++) {
                                const newRow = row + dr;
                                const newCol = col + dc;
                                if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15 && 
                                    this.board[newRow][newCol] === 0) {
                                    return { row: newRow, col: newCol };
                                }
                            }
                        }
                    }
                }
            }
        }
        
        return { row: 7, col: 7 };
    }

    // Professional Negamax with Alpha-Beta pruning
    negamax(depth, alpha, beta, color) {
        // Terminal node evaluation
        if (depth === 0 || this.gameOver) {
            return { score: color * this.evaluateBoard(), move: null };
        }

        let bestMove = null;
        let bestScore = -Infinity;
        
        // Get candidate moves with intelligent ordering
        const moves = this.getOrderedMoves();
        
        // Adaptive move limitation based on depth
        const maxMoves = this.getMoveLimit(depth, moves.length);

        for (let i = 0; i < maxMoves; i++) {
            const { row, col } = moves[i];
            
            // Make move
            const player = color > 0 ? 2 : 1; // AI=2 when color=1, Human=1 when color=-1
            this.board[row][col] = player;
            
            // Check for immediate win
            if (this.checkWin(row, col, player)) {
                this.board[row][col] = 0;
                return { score: 50000 + depth, move: { row, col } }; // Prefer quicker wins
            }

            // Recursive negamax call
            const result = this.negamax(depth - 1, -beta, -alpha, -color);
            const score = -result.score;
            
            // Undo move
            this.board[row][col] = 0;

            // Update best move
            if (score > bestScore) {
                bestScore = score;
                bestMove = { row, col };
            }

            // Alpha-beta pruning
            alpha = Math.max(alpha, score);
            if (alpha >= beta) {
                break; // Beta cutoff
            }
        }

        return { score: bestScore, move: bestMove };
    }

    // Intelligent move limitation based on search depth
    getMoveLimit(depth, totalMoves) {
        if (depth >= 5) return Math.min(totalMoves, 6);   // Deep search: fewer moves
        if (depth >= 3) return Math.min(totalMoves, 10);  // Medium search
        if (depth >= 1) return Math.min(totalMoves, 15);  // Shallow search
        return totalMoves; // Leaf nodes
    }

    // Advanced move ordering for optimal alpha-beta pruning
    getOrderedMoves() {
        const moves = [];
        const criticalMoves = [];
        const goodMoves = [];
        const normalMoves = [];

        for (let row = 0; row < 15; row++) {
            for (let col = 0; col < 15; col++) {
                if (this.board[row][col] === 0) {
                    const moveValue = this.evaluateMoveImportance(row, col);
                    const move = { row, col, value: moveValue };

                    if (moveValue >= 10000) {
                        criticalMoves.push(move); // Winning moves or critical blocks
                    } else if (moveValue >= 1000) {
                        goodMoves.push(move); // Strong tactical moves
                    } else {
                        normalMoves.push(move); // Regular moves
                    }
                }
            }
        }

        // Sort each category by value (descending)
        criticalMoves.sort((a, b) => b.value - a.value);
        goodMoves.sort((a, b) => b.value - a.value);
        normalMoves.sort((a, b) => b.value - a.value);

        return [...criticalMoves, ...goodMoves, ...normalMoves];
    }

    // Evaluate move importance for ordering
    evaluateMoveImportance(row, col) {
        let maxValue = 0;

        // Test move for both players
        for (const player of [2, 1]) { // AI first, then human
            this.board[row][col] = player;
            
            // Check for immediate win
            if (this.checkWin(row, col, player)) {
                this.board[row][col] = 0;
                return player === 2 ? 50000 : 45000; // Winning > blocking
            }

            // Evaluate patterns created
            const patternValue = this.evaluatePatterns(row, col, player);
            maxValue = Math.max(maxValue, patternValue * (player === 2 ? 1 : 0.9));
            
            this.board[row][col] = 0;
        }

        return maxValue;
    }

    isThreatPosition(row, col) {
        // Check if this position creates a threat for AI or blocks player threat
        const players = [1, 2];
        
        for (const player of players) {
            this.board[row][col] = player;
            
            // Check for 4-in-a-row (immediate threat)
            if (this.countConsecutive(row, col, player) >= 4) {
                this.board[row][col] = 0;
                return true;
            }
            
            // Check for 3-in-a-row with open ends
            if (this.hasOpenThree(row, col, player)) {
                this.board[row][col] = 0;
                return true;
            }
            
            this.board[row][col] = 0;
        }
        
        return false;
    }

    countConsecutive(row, col, player) {
        const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
        let maxCount = 0;

        for (const [dx, dy] of directions) {
            let count = 1;

            // Count in positive direction
            for (let i = 1; i < 5; i++) {
                const newRow = row + i * dx;
                const newCol = col + i * dy;
                if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15 && 
                    this.board[newRow][newCol] === player) {
                    count++;
                } else {
                    break;
                }
            }

            // Count in negative direction
            for (let i = 1; i < 5; i++) {
                const newRow = row - i * dx;
                const newCol = col - i * dy;
                if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15 && 
                    this.board[newRow][newCol] === player) {
                    count++;
                } else {
                    break;
                }
            }

            maxCount = Math.max(maxCount, count);
        }

        return maxCount;
    }

    hasOpenThree(row, col, player) {
        const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

        for (const [dx, dy] of directions) {
            let count = 1;
            let openEnds = 0;

            // Check positive direction
            let i = 1;
            while (i <= 3) {
                const newRow = row + i * dx;
                const newCol = col + i * dy;
                if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15) {
                    if (this.board[newRow][newCol] === player) {
                        count++;
                    } else if (this.board[newRow][newCol] === 0) {
                        openEnds++;
                        break;
                    } else {
                        break;
                    }
                }
                i++;
            }

            // Check negative direction
            i = 1;
            while (i <= 3) {
                const newRow = row - i * dx;
                const newCol = col - i * dy;
                if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15) {
                    if (this.board[newRow][newCol] === player) {
                        count++;
                    } else if (this.board[newRow][newCol] === 0) {
                        openEnds++;
                        break;
                    } else {
                        break;
                    }
                }
                i++;
            }

            if (count >= 3 && openEnds >= 1) {
                return true;
            }
        }

        return false;
    }

    // Professional board evaluation using pattern recognition
    evaluateBoard() {
        let score = 0;
        
        // Evaluate all patterns for both players
        score += this.evaluateAllPatterns(2);  // AI patterns (positive)
        score -= this.evaluateAllPatterns(1);  // Human patterns (negative)
        
        return score;
    }

    // Comprehensive pattern evaluation
    evaluateAllPatterns(player) {
        let totalScore = 0;
        const patterns = this.findAllPatterns(player);
        
        // Pattern scoring table (research-based values)
        const PATTERN_SCORES = {
            'FIVE': 100000,      // 连五 - 胜利
            'OPEN_FOUR': 10000,  // 活四 - 必胜
            'FOUR': 1000,        // 冲四 - 强威胁
            'OPEN_THREE': 1000,  // 活三 - 强威胁
            'THREE': 100,        // 眠三 - 一般威胁
            'OPEN_TWO': 100,     // 活二 - 发展潜力
            'TWO': 10,           // 眠二 - 基础价值
            'ONE': 1             // 单子 - 基础价值
        };

        // Count and score patterns
        for (const [patternType, count] of Object.entries(patterns)) {
            if (PATTERN_SCORES[patternType]) {
                totalScore += PATTERN_SCORES[patternType] * count;
            }
        }

        return totalScore;
    }

    // Find all patterns for a player
    findAllPatterns(player) {
        const patterns = {
            'FIVE': 0, 'OPEN_FOUR': 0, 'FOUR': 0,
            'OPEN_THREE': 0, 'THREE': 0,
            'OPEN_TWO': 0, 'TWO': 0, 'ONE': 0
        };

        const directions = [[1, 0], [0, 1], [1, 1], [1, -1]]; // 四个方向

        for (let row = 0; row < 15; row++) {
            for (let col = 0; col < 15; col++) {
                if (this.board[row][col] === player) {
                    for (const [dx, dy] of directions) {
                        const pattern = this.analyzePattern(row, col, dx, dy, player);
                        if (pattern) {
                            patterns[pattern]++;
                        }
                    }
                }
            }
        }

        return patterns;
    }

    // Analyze pattern in a specific direction
    analyzePattern(row, col, dx, dy, player) {
        let consecutive = 1;
        let leftBlocked = false;
        let rightBlocked = false;
        let leftEmpty = 0;
        let rightEmpty = 0;

        // Check left direction
        let r = row - dx, c = col - dy;
        while (r >= 0 && r < 15 && c >= 0 && c < 15) {
            if (this.board[r][c] === player) {
                consecutive++;
                r -= dx;
                c -= dy;
            } else if (this.board[r][c] === 0) {
                leftEmpty++;
                break;
            } else {
                leftBlocked = true;
                break;
            }
        }
        if (r < 0 || r >= 15 || c < 0 || c >= 15) leftBlocked = true;

        // Check right direction
        r = row + dx;
        c = col + dy;
        while (r >= 0 && r < 15 && c >= 0 && c < 15) {
            if (this.board[r][c] === player) {
                consecutive++;
                r += dx;
                c += dy;
            } else if (this.board[r][c] === 0) {
                rightEmpty++;
                break;
            } else {
                rightBlocked = true;
                break;
            }
        }
        if (r < 0 || r >= 15 || c < 0 || c >= 15) rightBlocked = true;

        // Classify pattern based on consecutive stones and blocking
        return this.classifyPattern(consecutive, leftBlocked, rightBlocked, leftEmpty, rightEmpty);
    }

    // Classify pattern type based on analysis
    classifyPattern(consecutive, leftBlocked, rightBlocked, leftEmpty, rightEmpty) {
        const bothBlocked = leftBlocked && rightBlocked;
        const neitherBlocked = !leftBlocked && !rightBlocked;

        if (consecutive >= 5) return 'FIVE';
        
        if (consecutive === 4) {
            if (neitherBlocked) return 'OPEN_FOUR';
            if (!bothBlocked) return 'FOUR';
            return null; // Blocked four is not valuable
        }
        
        if (consecutive === 3) {
            if (neitherBlocked && leftEmpty > 0 && rightEmpty > 0) return 'OPEN_THREE';
            if (!bothBlocked) return 'THREE';
            return null;
        }
        
        if (consecutive === 2) {
            if (neitherBlocked && leftEmpty > 0 && rightEmpty > 0) return 'OPEN_TWO';
            if (!bothBlocked) return 'TWO';
            return null;
        }
        
        if (consecutive === 1) {
            if (!bothBlocked) return 'ONE';
            return null;
        }

        return null;
    }

    // Evaluate patterns created by a specific move
    evaluatePatterns(row, col, player) {
        let score = 0;
        const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

        for (const [dx, dy] of directions) {
            const pattern = this.analyzePattern(row, col, dx, dy, player);
            if (pattern) {
                const PATTERN_VALUES = {
                    'FIVE': 50000, 'OPEN_FOUR': 10000, 'FOUR': 5000,
                    'OPEN_THREE': 1000, 'THREE': 500,
                    'OPEN_TWO': 100, 'TWO': 50, 'ONE': 10
                };
                score += PATTERN_VALUES[pattern] || 0;
            }
        }

        return score;
    }

    evaluatePosition(row, col, player = null) {
        let score = 0;
        const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
        const currentPlayer = player || 2;

        // Center preference
        const centerDistance = Math.abs(row - 7) + Math.abs(col - 7);
        score += (14 - centerDistance) * 3;

        // Evaluate all directions
        for (const [dx, dy] of directions) {
            const lineScore = this.evaluateLine(row, col, dx, dy, currentPlayer);
            score += lineScore;
        }

        // Bonus for positions near existing stones
        let nearbyStones = 0;
        for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
                const newRow = row + dr;
                const newCol = col + dc;
                if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15 && 
                    this.board[newRow][newCol] !== 0) {
                    nearbyStones++;
                }
            }
        }
        score += nearbyStones * 5;

        return score;
    }

    evaluateLine(row, col, dx, dy, player) {
        let score = 0;
        let consecutive = 1;
        let openEnds = 0;
        let blocked = 0;

        // Check positive direction
        for (let i = 1; i < 5; i++) {
            const newRow = row + i * dx;
            const newCol = col + i * dy;
            
            if (newRow < 0 || newRow >= 15 || newCol < 0 || newCol >= 15) {
                blocked++;
                break;
            }
            
            if (this.board[newRow][newCol] === player) {
                consecutive++;
            } else if (this.board[newRow][newCol] === 0) {
                openEnds++;
                break;
            } else {
                blocked++;
                break;
            }
        }

        // Check negative direction
        for (let i = 1; i < 5; i++) {
            const newRow = row - i * dx;
            const newCol = col - i * dy;
            
            if (newRow < 0 || newRow >= 15 || newCol < 0 || newCol >= 15) {
                blocked++;
                break;
            }
            
            if (this.board[newRow][newCol] === player) {
                consecutive++;
            } else if (this.board[newRow][newCol] === 0) {
                openEnds++;
                break;
            } else {
                blocked++;
                break;
            }
        }

        // Enhanced scoring based on consecutive stones and openness
        if (consecutive >= 5) {
            score += 10000000; // Winning move - highest priority
        } else if (consecutive === 4) {
            score += openEnds > 0 ? 1000000 : 50000; // Four in a row
        } else if (consecutive === 3) {
            if (openEnds >= 2) {
                score += 100000; // Open three - very strong threat
            } else if (openEnds === 1) {
                score += 10000; // Semi-open three
            } else {
                score += 500; // Blocked three
            }
        } else if (consecutive === 2) {
            if (openEnds >= 2) {
                score += 5000; // Open two - good potential
            } else if (openEnds === 1) {
                score += 500; // Semi-open two
            } else {
                score += 50; // Blocked two
            }
        } else if (consecutive === 1 && openEnds >= 2) {
            score += 100; // Open single stone
        }

        return score;
    }

    checkWin(row, col, player) {
        const directions = [
            [0, 1], [1, 0], [1, 1], [1, -1]
        ];

        for (const [dx, dy] of directions) {
            let count = 1;

            // Check positive direction
            for (let i = 1; i < 5; i++) {
                const newRow = row + i * dx;
                const newCol = col + i * dy;
                if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15 && 
                    this.board[newRow][newCol] === player) {
                    count++;
                } else {
                    break;
                }
            }

            // Check negative direction
            for (let i = 1; i < 5; i++) {
                const newRow = row - i * dx;
                const newCol = col - i * dy;
                if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15 && 
                    this.board[newRow][newCol] === player) {
                    count++;
                } else {
                    break;
                }
            }

            if (count >= 5) {
                return true;
            }
        }

        return false;
    }

    getGridPosition(x, y) {
        const col = Math.round((x - this.margin) / this.cellSize);
        const row = Math.round((y - this.margin) / this.cellSize);
        
        if (row >= 0 && row < this.boardSize && col >= 0 && col < this.boardSize) {
            return { row, col };
        }
        
        return { row: -1, col: -1 };
    }

    drawBoard() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw board background
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        gradient.addColorStop(0, '#deb887');
        gradient.addColorStop(1, '#d2b48c');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid lines
        this.ctx.strokeStyle = '#8b4513';
        this.ctx.lineWidth = 1;
        
        for (let i = 0; i < this.boardSize; i++) {
            // Vertical lines
            this.ctx.beginPath();
            this.ctx.moveTo(this.margin + i * this.cellSize, this.margin);
            this.ctx.lineTo(this.margin + i * this.cellSize, this.margin + (this.boardSize - 1) * this.cellSize);
            this.ctx.stroke();
            
            // Horizontal lines
            this.ctx.beginPath();
            this.ctx.moveTo(this.margin, this.margin + i * this.cellSize);
            this.ctx.lineTo(this.margin + (this.boardSize - 1) * this.cellSize, this.margin + i * this.cellSize);
            this.ctx.stroke();
        }
        
        // Draw star points
        const starPoints = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
        this.ctx.fillStyle = '#8b4513';
        
        for (const [row, col] of starPoints) {
            this.ctx.beginPath();
            this.ctx.arc(
                this.margin + col * this.cellSize,
                this.margin + row * this.cellSize,
                3, 0, 2 * Math.PI
            );
            this.ctx.fill();
        }
        
        // Draw stones
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] !== 0) {
                    this.drawStone(row, col, this.board[row][col]);
                }
            }
        }
        
        // Draw preview stone
        if (this.previewStone && !this.gameOver) {
            this.drawPreviewStone(this.previewStone.row, this.previewStone.col, this.previewStone.player);
        }
    }

    drawStone(row, col, player, scale = 1) {
        const x = this.margin + col * this.cellSize;
        const y = this.margin + row * this.cellSize;
        const radius = 18 * scale;
        
        this.ctx.save();
        
        if (player === 1) { // Black stone
            const gradient = this.ctx.createRadialGradient(x - 5, y - 5, 0, x, y, radius);
            gradient.addColorStop(0, '#555');
            gradient.addColorStop(0.7, '#222');
            gradient.addColorStop(1, '#000');
            this.ctx.fillStyle = gradient;
        } else { // White stone
            const gradient = this.ctx.createRadialGradient(x - 5, y - 5, 0, x, y, radius);
            gradient.addColorStop(0, '#fff');
            gradient.addColorStop(0.7, '#eee');
            gradient.addColorStop(1, '#ccc');
            this.ctx.fillStyle = gradient;
        }
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Add shadow
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        this.ctx.shadowBlur = 5;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;
        
        this.ctx.strokeStyle = player === 1 ? '#333' : '#999';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    drawPreviewStone(row, col, player) {
        this.ctx.save();
        this.ctx.globalAlpha = 0.5;
        
        const x = this.margin + col * this.cellSize;
        const y = this.margin + row * this.cellSize;
        const radius = 18;
        
        this.ctx.strokeStyle = player === 1 ? '#333' : '#999';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    animateStone(row, col, player) {
        this.animatingStones.push({
            row, col, player,
            scale: 0,
            targetScale: 1,
            animationTime: 0,
            duration: 300
        });
    }

    animate() {
        // Update animations
        this.animatingStones = this.animatingStones.filter(stone => {
            stone.animationTime += 16; // ~60fps
            const progress = Math.min(stone.animationTime / stone.duration, 1);
            
            // Easing function for bounce effect
            stone.scale = stone.targetScale * (1 - Math.pow(1 - progress, 3));
            
            return progress < 1;
        });
        
        this.drawBoard();
        
        // Draw animating stones
        for (const stone of this.animatingStones) {
            this.drawStone(stone.row, stone.col, stone.player, stone.scale);
        }
        
        requestAnimationFrame(() => this.animate());
    }

    addMoveToHistory(row, col, player, isAI = false) {
        const moveNumber = this.moveHistory.length + 1;
        const playerName = player === 1 ? 'Black' : 'White';
        const aiIndicator = isAI ? ' (AI)' : '';
        
        this.moveHistory.push({ row, col, player, moveNumber, isAI });
        
        const moveList = document.getElementById('moveList');
        if (moveList) {
            const moveItem = document.createElement('div');
            moveItem.className = `move-item ${player === 1 ? 'black' : 'white'}`;
            moveItem.innerHTML = `
                <span>${moveNumber}. ${playerName}${aiIndicator}</span>
                <span>(${row + 1}, ${String.fromCharCode(65 + col)})</span>
            `;
            
            moveList.appendChild(moveItem);
            moveList.scrollTop = moveList.scrollHeight;
        }
    }

    displayMoveHistory() {
        const moveList = document.getElementById('moveList');
        if (!moveList) return;
        
        moveList.innerHTML = '';
        
        this.moveHistory.forEach((move, index) => {
            const playerName = move.player === 1 ? 'Black' : 'White';
            const aiIndicator = move.isAI ? ' (AI)' : '';
            
            const moveItem = document.createElement('div');
            moveItem.className = `move-item ${move.player === 1 ? 'black' : 'white'}`;
            moveItem.innerHTML = `
                <span>${index + 1}. ${playerName}${aiIndicator}</span>
                <span>(${move.row + 1}, ${String.fromCharCode(65 + move.col)})</span>
            `;
            
            moveList.appendChild(moveItem);
        });
        
        moveList.scrollTop = moveList.scrollHeight;
    }

    handleGameOver(winner, message = null) {
        this.gameOver = true;
        this.winner = winner;
        
        const winnerName = winner === 1 ? 'Black' : 'White';
        const finalMessage = message || `${winnerName} player wins!`;
        
        this.showStatus(finalMessage, 'winner');
        this.showModal('Game Over!', finalMessage);
    }

    showModal(title, message) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalMessage').textContent = message;
        document.getElementById('gameModal').classList.remove('hidden');
    }

    closeModalAndNewGame() {
        document.getElementById('gameModal').classList.add('hidden');
        this.newGame();
    }

    newGame() {
        try {
            if (this.isConnected && !this.offlineMode && !this.localMultiplayerMode && !this.aiMode) {
                this.socket.emit('newGame');
            } else {
                this.resetGame();
                this.drawBoard();
                this.showStatus('New game started!', 'info');
            }
        } catch (error) {
            console.error('Error starting new game:', error);
            // Fallback to local reset
            this.resetGame();
            this.drawBoard();
            this.showStatus('New game started!', 'info');
        }
    }

    resetGame() {
        this.board = Array(15).fill().map(() => Array(15).fill(0));
        this.currentPlayer = 1;
        this.gameOver = false;
        this.winner = null;
        this.moveHistory = [];
        this.animatingStones = [];
        this.previewStone = null;
        
        document.getElementById('moveList').innerHTML = '';
        this.updateTurnIndicator(true);
        
        this.updateGameModeButtons();
    }

    updatePlayerInfo() {
        const playerBadge = document.getElementById('playerNumber');
        if (this.localMultiplayerMode) {
            playerBadge.textContent = 'Local Multiplayer';
            playerBadge.className = 'player-badge';
        } else if (this.aiMode) {
            playerBadge.textContent = 'You vs AI';
            playerBadge.className = 'player-badge black';
        } else if (this.offlineMode) {
            playerBadge.textContent = 'Offline Mode';
            playerBadge.className = 'player-badge';
        } else if (this.playerNumber) {
            const color = this.playerNumber === 1 ? 'Black' : 'White';
            playerBadge.textContent = `You are ${color}`;
            playerBadge.className = `player-badge ${color.toLowerCase()}`;
        }
    }

    updateTurnIndicator(isYourTurn) {
        const turnIndicator = document.getElementById('currentTurn');
        
        if (this.gameOver) {
            turnIndicator.textContent = 'Game Over';
            turnIndicator.className = 'turn-indicator';
        } else if (this.localMultiplayerMode) {
            const currentPlayerName = this.currentPlayer === 1 ? 'Black' : 'White';
            turnIndicator.textContent = `${currentPlayerName}'s Turn`;
            turnIndicator.className = 'turn-indicator your-turn';
        } else if (this.offlineMode && !this.aiMode) {
            const currentPlayerName = this.currentPlayer === 1 ? 'Black' : 'White';
            turnIndicator.textContent = `${currentPlayerName}'s Turn`;
            turnIndicator.className = 'turn-indicator your-turn';
        } else if (isYourTurn) {
            turnIndicator.textContent = 'Your Turn';
            turnIndicator.className = 'turn-indicator your-turn';
        } else {
            const waitingFor = this.aiMode ? 'AI' : 'Opponent';
            turnIndicator.textContent = `Waiting for ${waitingFor}`;
            turnIndicator.className = 'turn-indicator';
        }
    }

    updateConnectionStatus(text, connected) {
        const statusText = document.querySelector('.status-text');
        const statusDot = document.querySelector('.status-dot');
        
        statusText.textContent = text;
        statusDot.className = connected ? 'status-dot connected' : 'status-dot';
    }

    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('gameStatus');
        statusElement.textContent = message;
        statusElement.className = `game-status ${type}`;
        
        // Auto-hide after 3 seconds for non-winner messages
        if (type !== 'winner') {
            setTimeout(() => {
                if (statusElement.textContent === message) {
                    statusElement.textContent = '';
                    statusElement.className = 'game-status';
                }
            }, 3000);
        }
    }

    updateUI() {
        this.updatePlayerInfo();
        this.updateTurnIndicator(false);
        this.updateConnectionStatus('Connecting...', false);
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GomokuGame();
});
