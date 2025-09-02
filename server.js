const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Game state
class GomokuGame {
    constructor() {
        this.board = Array(15).fill().map(() => Array(15).fill(0)); // 0: empty, 1: black, 2: white
        this.currentPlayer = 1; // 1: black, 2: white
        this.players = [];
        this.gameOver = false;
        this.winner = null;
        this.aiMode = false;
        this.moveHistory = [];
    }

    reset() {
        this.board = Array(15).fill().map(() => Array(15).fill(0));
        this.currentPlayer = 1;
        this.gameOver = false;
        this.winner = null;
        this.moveHistory = [];
    }

    isValidMove(row, col) {
        return row >= 0 && row < 15 && col >= 0 && col < 15 && this.board[row][col] === 0;
    }

    makeMove(row, col, player = null) {
        if (!this.isValidMove(row, col) || this.gameOver) {
            return false;
        }

        const actualPlayer = player || this.currentPlayer;
        this.board[row][col] = actualPlayer;
        this.moveHistory.push({ row, col, player: actualPlayer });
        
        if (this.checkWin(row, col, actualPlayer)) {
            this.gameOver = true;
            this.winner = actualPlayer;
            return { success: true, win: true, winner: actualPlayer };
        }

        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        return { success: true, win: false };
    }

    checkWin(row, col, player) {
        const directions = [
            [0, 1],   // horizontal
            [1, 0],   // vertical
            [1, 1],   // diagonal \
            [1, -1]   // diagonal /
        ];

        for (const [dx, dy] of directions) {
            let count = 1; // Count the current stone

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

    // Professional Negamax with Alpha-Beta pruning
    getBestMove() {
        const depth = 6; // Professional depth for strong play
        const result = this.negamax(depth, -Infinity, Infinity, 1); // 1 for AI (maximizing player)
        return result.move || this.getStrategicMove();
    }

    getStrategicMove() {
        // If no moves found, choose strategic position
        const center = { row: 7, col: 7 };
        if (this.isValidMove(center.row, center.col)) {
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
                                if (this.isValidMove(newRow, newCol)) {
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

    // Negamax with Alpha-Beta pruning - more elegant and efficient
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
                if (this.isValidMove(row, col)) {
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
        const oneBlocked = leftBlocked || rightBlocked;
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
            score += 1000000; // Winning move
        } else if (consecutive === 4) {
            score += openEnds > 0 ? 100000 : 5000; // Four in a row
        } else if (consecutive === 3) {
            if (openEnds >= 2) {
                score += 10000; // Open three - very strong
            } else if (openEnds === 1) {
                score += 1000; // Semi-open three
            } else {
                score += 50; // Blocked three
            }
        } else if (consecutive === 2) {
            if (openEnds >= 2) {
                score += 500; // Open two
            } else if (openEnds === 1) {
                score += 50; // Semi-open two
            } else {
                score += 5; // Blocked two
            }
        } else if (consecutive === 1 && openEnds >= 2) {
            score += 10; // Open single stone
        }

        return score;
    }
}

const game = new GomokuGame();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Add player to game or restore existing session
    let existingPlayer = game.players.find(p => p.id === socket.id);
    
    if (!existingPlayer && game.players.length < 2) {
        const playerNumber = game.players.length + 1;
        game.players.push({ id: socket.id, number: playerNumber });
        socket.emit('playerAssigned', { 
            playerNumber, 
            isYourTurn: playerNumber === game.currentPlayer,
            board: game.board,
            gameState: {
                currentPlayer: game.currentPlayer,
                gameOver: game.gameOver,
                winner: game.winner,
                players: game.players.length,
                moveHistory: game.moveHistory
            }
        });
        
        // Notify all clients about player count
        io.emit('playerUpdate', { players: game.players.length });
        
        if (game.players.length === 2) {
            io.emit('gameStart', { message: 'Game started! Black player goes first.' });
        }
    } else if (existingPlayer) {
        // Restore existing player session
        socket.emit('playerAssigned', { 
            playerNumber: existingPlayer.number, 
            isYourTurn: existingPlayer.number === game.currentPlayer,
            board: game.board,
            gameState: {
                currentPlayer: game.currentPlayer,
                gameOver: game.gameOver,
                winner: game.winner,
                players: game.players.length,
                moveHistory: game.moveHistory
            }
        });
        
        // Restore move history for UI
        socket.emit('restoreHistory', { moveHistory: game.moveHistory });
    } else {
        socket.emit('gameFull', { message: 'Game is full. Please wait for a new game.' });
    }

    // Handle moves
    socket.on('makeMove', (data) => {
        const { row, col } = data;
        const player = game.players.find(p => p.id === socket.id);
        
        if (!player) {
            socket.emit('error', { message: 'Player not found' });
            return;
        }

        // Validate it's the player's turn
        if (player.number !== game.currentPlayer) {
            socket.emit('error', { message: 'Not your turn!' });
            return;
        }

        // Validate move coordinates
        if (typeof row !== 'number' || typeof col !== 'number' || 
            row < 0 || row >= 15 || col < 0 || col >= 15) {
            socket.emit('error', { message: 'Invalid move coordinates' });
            return;
        }

        const result = game.makeMove(row, col);
        
        if (result.success) {
            io.emit('moveUpdate', { 
                row, 
                col, 
                player: player.number, 
                currentPlayer: game.currentPlayer,
                gameOver: game.gameOver,
                winner: game.winner
            });

            if (result.win) {
                io.emit('gameOver', { 
                    winner: player.number, 
                    message: `Player ${player.number} wins!` 
                });
            }
        } else {
            socket.emit('error', { message: 'Invalid move' });
        }
    });

    // Handle AI mode
    socket.on('enableAI', () => {
        game.aiMode = true;
        game.players = [{ id: socket.id, number: 1 }]; // Player is always black
        socket.emit('aiEnabled', { 
            message: 'AI mode enabled. You are black stones.',
            board: game.board,
            gameState: {
                currentPlayer: game.currentPlayer,
                gameOver: game.gameOver,
                winner: game.winner,
                aiMode: true
            }
        });
    });

    socket.on('aiMove', () => {
        if (game.aiMode && game.currentPlayer === 2 && !game.gameOver) {
            const aiMove = game.getBestMove();
            const result = game.makeMove(aiMove.row, aiMove.col, 2);
            
            if (result.success) {
                io.emit('moveUpdate', { 
                    row: aiMove.row, 
                    col: aiMove.col, 
                    player: 2, 
                    currentPlayer: game.currentPlayer,
                    gameOver: game.gameOver,
                    winner: game.winner,
                    isAI: true
                });

                if (result.win) {
                    io.emit('gameOver', { 
                        winner: 2, 
                        message: 'AI wins!' 
                    });
                }
            }
        }
    });

    // Handle new game
    socket.on('newGame', () => {
        game.reset();
        game.players = game.players.filter(p => p.id === socket.id || io.sockets.sockets.has(p.id));
        
        // Reassign player numbers
        game.players.forEach((player, index) => {
            player.number = index + 1;
        });

        io.emit('gameReset', { 
            board: game.board,
            currentPlayer: game.currentPlayer,
            players: game.players.length,
            message: 'New game started!'
        });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        game.players = game.players.filter(p => p.id !== socket.id);
        io.emit('playerUpdate', { players: game.players.length });
        
        if (game.players.length === 0) {
            game.reset();
        }
    });

    // Send current game state to new connections
    socket.emit('gameState', {
        board: game.board,
        currentPlayer: game.currentPlayer,
        gameOver: game.gameOver,
        winner: game.winner,
        players: game.players.length
    });
});

// REST API endpoints for game state
app.get('/api/game-state', (req, res) => {
    res.json({
        board: game.board,
        currentPlayer: game.currentPlayer,
        gameOver: game.gameOver,
        winner: game.winner,
        players: game.players.length,
        moveHistory: game.moveHistory
    });
});

app.post('/api/new-game', (req, res) => {
    game.reset();
    io.emit('gameReset', { 
        board: game.board,
        currentPlayer: game.currentPlayer,
        players: game.players.length,
        message: 'New game started!'
    });
    res.json({ success: true, message: 'New game started' });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Gomoku server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to play the game`);
});
