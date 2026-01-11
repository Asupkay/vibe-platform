/**
 * Games API - Multiplayer mini-games for /vibe users
 *
 * Uses Vercel KV (Redis) for game state persistence
 *
 * POST /api/games - Create a new game
 * GET /api/games?player=X - Get active games for player
 * GET /api/games?id=X - Get specific game state
 * PUT /api/games - Make a move
 */

const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const GAMES_KEY = 'vibe:games';

let memoryGames = {};

async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    return null;
  }
}

async function getGames() {
  const kv = await getKV();
  if (kv) {
    const games = await kv.get(GAMES_KEY);
    return games || {};
  }
  return memoryGames;
}

async function saveGames(games) {
  const kv = await getKV();
  if (kv) {
    await kv.set(GAMES_KEY, games);
  }
  memoryGames = games;
}

function generateId() {
  return 'game_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
}

// Game logic helpers
function createInitialState(gameType) {
  switch (gameType) {
    case 'tictactoe':
      return {
        board: Array(9).fill(null),
        currentPlayer: 'X',
        winner: null
      };
    case 'hangman':
      const words = ['javascript', 'terminal', 'multiplayer', 'protocol', 'blockchain', 'artificial', 'intelligence', 'developer'];
      const word = words[Math.floor(Math.random() * words.length)];
      return {
        word,
        guessed: [],
        remainingGuesses: 6,
        revealed: '_'.repeat(word.length)
      };
    case 'wordassociation':
      return {
        words: [],
        currentPlayer: null,
        lastWord: ''
      };
    default:
      return {};
  }
}

function checkTicTacToeWinner(board) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6]             // diagonals
  ];

  for (const [a, b, c] of winPatterns) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  // Check for draw
  if (board.every(cell => cell !== null)) {
    return 'draw';
  }

  return null;
}

function processMove(game, move, player) {
  const state = game.state;

  switch (game.type) {
    case 'tictactoe': {
      const position = typeof move === 'number' ? move : move.position;
      if (position < 0 || position > 8 || state.board[position] || state.winner) {
        return { error: 'Invalid move' };
      }

      // Determine player symbol (first player is X, second is O)
      const playerIndex = game.players.indexOf(player);
      const symbol = playerIndex === 0 ? 'X' : 'O';

      if (state.currentPlayer !== symbol) {
        return { error: 'Not your turn' };
      }

      state.board[position] = symbol;
      const winner = checkTicTacToeWinner(state.board);

      if (winner) {
        state.winner = winner;
        game.status = 'completed';
      } else {
        state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X';
      }
      break;
    }

    case 'hangman': {
      const letter = (move.letter || move).toLowerCase();
      if (letter.length !== 1 || state.guessed.includes(letter)) {
        return { error: 'Invalid guess' };
      }

      state.guessed.push(letter);

      if (state.word.includes(letter)) {
        state.revealed = state.word.split('').map((char, i) =>
          state.guessed.includes(char) ? char : '_'
        ).join('');

        if (!state.revealed.includes('_')) {
          game.status = 'completed';
          state.winner = player;
        }
      } else {
        state.remainingGuesses--;
        if (state.remainingGuesses === 0) {
          game.status = 'completed';
          state.revealed = state.word;
        }
      }
      break;
    }

    case 'wordassociation': {
      const word = (move.word || move).toLowerCase().trim();
      if (!word) {
        return { error: 'Invalid word' };
      }

      state.words.push({ word, player, timestamp: new Date().toISOString() });
      state.lastWord = word;

      // Alternate players
      const otherPlayer = game.players.find(p => p !== player);
      state.currentPlayer = otherPlayer || player;
      break;
    }
  }

  game.updated_at = new Date().toISOString();
  return { success: true };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST - Create new game
  if (req.method === 'POST') {
    const { player, gameType, opponent } = req.body;

    if (!player || !gameType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: player, gameType'
      });
    }

    if (!['tictactoe', 'hangman', 'wordassociation'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type. Must be: tictactoe, hangman, wordassociation'
      });
    }

    const gameId = generateId();
    const game = {
      id: gameId,
      type: gameType,
      players: opponent ? [player, opponent] : [player],
      status: opponent ? 'waiting' : 'active',
      state: createInitialState(gameType),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // For word association, set first player
    if (gameType === 'wordassociation') {
      game.state.currentPlayer = player;
    }

    const games = await getGames();
    games[gameId] = game;
    await saveGames(games);

    return res.status(200).json({
      success: true,
      game,
      storage: KV_CONFIGURED ? 'kv' : 'memory'
    });
  }

  // PUT - Make a move
  if (req.method === 'PUT') {
    const { gameId, player, move } = req.body;

    if (!gameId || !player || move === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: gameId, player, move'
      });
    }

    const games = await getGames();
    const game = games[gameId];

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      });
    }

    if (!game.players.includes(player)) {
      return res.status(403).json({
        success: false,
        error: 'Not a player in this game'
      });
    }

    if (game.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: `Game is ${game.status}`
      });
    }

    const result = processMove(game, move, player);

    if (result.error) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    await saveGames(games);

    return res.status(200).json({
      success: true,
      game,
      storage: KV_CONFIGURED ? 'kv' : 'memory'
    });
  }

  // GET - Fetch games
  if (req.method === 'GET') {
    const { id, player } = req.query;
    const games = await getGames();

    // Get specific game
    if (id) {
      const game = games[id];
      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Game not found'
        });
      }

      // Hide word in hangman for active games
      const sanitizedGame = { ...game };
      if (game.type === 'hangman' && game.status === 'active') {
        sanitizedGame.state = { ...game.state, word: undefined };
      }

      return res.status(200).json({
        success: true,
        game: sanitizedGame,
        storage: KV_CONFIGURED ? 'kv' : 'memory'
      });
    }

    // Get games for player
    if (player) {
      const playerGames = Object.values(games)
        .filter(g => g.players.includes(player))
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .map(g => {
          // Hide word in hangman
          if (g.type === 'hangman' && g.status === 'active') {
            return { ...g, state: { ...g.state, word: undefined } };
          }
          return g;
        });

      return res.status(200).json({
        success: true,
        games: playerGames,
        active: playerGames.filter(g => g.status === 'active').length,
        total: playerGames.length,
        storage: KV_CONFIGURED ? 'kv' : 'memory'
      });
    }

    // Return all active games (for lobby)
    const activeGames = Object.values(games)
      .filter(g => g.status === 'active' || g.status === 'waiting')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.status(200).json({
      success: true,
      games: activeGames,
      total: activeGames.length,
      storage: KV_CONFIGURED ? 'kv' : 'memory'
    });
  }

  // DELETE - Clean up old games
  if (req.method === 'DELETE') {
    const { gameId, olderThan } = req.query;
    const games = await getGames();

    if (gameId) {
      delete games[gameId];
    } else if (olderThan) {
      const cutoff = new Date(Date.now() - parseInt(olderThan) * 1000);
      for (const id of Object.keys(games)) {
        if (new Date(games[id].updated_at) < cutoff) {
          delete games[id];
        }
      }
    }

    await saveGames(games);

    return res.status(200).json({
      success: true,
      remaining: Object.keys(games).length,
      storage: KV_CONFIGURED ? 'kv' : 'memory'
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
