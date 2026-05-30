import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, deleteDoc, serverTimestamp, increment, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { Game } from '../types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface GameBoardProps {
  user: User;
}

export function GameBoard({ user }: GameBoardProps) {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!gameId) return;
    const gameRef = doc(db, 'games', gameId);
    
    const unsubscribe = onSnapshot(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = { id: snapshot.id, ...snapshot.data() } as Game;
        setGame(data);
        
        // Auto-join if guest
        if (data.status === 'waiting' && data.hostId !== user.uid) {
          joinGame(gameRef, data.hostId);
        }
        
        // Claim win if finished and we are the winner
        if (data.status === 'finished' && data.winnerId === user.uid && !data.scoreClaimed) {
          claimWin(gameRef);
        }
      } else {
        setError('Partida não encontrada.');
      }
    });

    return () => unsubscribe();
  }, [gameId, user.uid]);

  const joinGame = async (gameRef: any, hostId: string) => {
    try {
      await updateDoc(gameRef, {
        status: 'playing',
        guestId: user.uid,
        guestName: user.displayName || 'Anônimo',
        currentPlayerId: hostId,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Failed to join', e);
    }
  };

  const claimWin = async (gameRef: any) => {
    if (!user.uid) return;
    try {
      // 1. claim score in game doc
      await updateDoc(gameRef, {
        scoreClaimed: true,
        updatedAt: serverTimestamp()
      });
      // 2. update user profile global score
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        wins: increment(1),
        [`monthlyWins.${currentMonth}`]: increment(1)
      });
    } catch (e) {
      console.error('Failed to claim win', e);
    }
  };

  const processMove = async (lineId: string, playerUid: string) => {
    if (!game || game.status !== 'playing') return;
    if (game.lines.includes(lineId)) return;

    const size = game.boardSize;
    const isHost = playerUid === game.hostId;
    
    // Check if box completed
    const [type, rStr, cStr] = lineId.split('_');
    const r = parseInt(rStr, 10);
    const c = parseInt(cStr, 10);
    const linesSet = new Set(game.lines);
    const newBoxes: string[] = [];

    const checkSquare = (row: number, col: number) => {
      if (row < 0 || row >= size || col < 0 || col >= size) return false;
      const top = `H_${row}_${col}`;
      const bottom = `H_${row + 1}_${col}`;
      const left = `V_${row}_${col}`;
      const right = `V_${row}_${col + 1}`;
      
      const tl = lineId === top || linesSet.has(top);
      const bl = lineId === bottom || linesSet.has(bottom);
      const ll = lineId === left || linesSet.has(left);
      const rl = lineId === right || linesSet.has(right);
      
      if (tl && bl && ll && rl) {
        newBoxes.push(`${row}_${col}_${playerUid}`);
        return true;
      }
      return false;
    };

    let boxesCompleted = 0;
    if (type === 'H') {
      if (checkSquare(r - 1, c)) boxesCompleted++;
      if (checkSquare(r, c)) boxesCompleted++;
    } else {
      if (checkSquare(r, c - 1)) boxesCompleted++;
      if (checkSquare(r, c)) boxesCompleted++;
    }

    const nextTurn = boxesCompleted > 0 ? playerUid : (isHost ? game.guestId : game.hostId);
    const newScoreHost = game.scoreHost + (isHost ? boxesCompleted : 0);
    const newScoreGuest = game.scoreGuest + (!isHost ? boxesCompleted : 0);
    
    const combinedBoxes = [...game.boxes, ...newBoxes];
    const isFinished = combinedBoxes.length === size * size;
    let winnerId = null;
    let newStatus = game.status;
    
    if (isFinished) {
      newStatus = 'finished';
      if (newScoreHost > newScoreGuest) winnerId = game.hostId;
      else if (newScoreGuest > newScoreHost) winnerId = game.guestId;
    }

    try {
      const updates: any = {
        lines: [...game.lines, lineId],
        boxes: combinedBoxes,
        scoreHost: newScoreHost,
        scoreGuest: newScoreGuest,
        currentPlayerId: nextTurn,
        status: newStatus,
        updatedAt: serverTimestamp()
      };
      if (isFinished) {
        updates.winnerId = winnerId;
      }
      await updateDoc(doc(db, 'games', gameId as string), updates);
    } catch (e) {
      console.error('Error updating move', e);
    }
  };

  const handleLineClick = async (lineId: string) => {
    if (!game || game.status !== 'playing') return;
    if (game.currentPlayerId !== user.uid) return;
    await processMove(lineId, user.uid);
  };

  const handleLeaveGame = async () => {
    if (game?.status === 'waiting' && game.hostId === user.uid) {
      try {
        await deleteDoc(doc(db, 'games', gameId as string));
      } catch (e) {
        console.error('Error deleting game', e);
      }
    }
    navigate('/');
  };

  useEffect(() => {
    if (!game) return;
    if (game.status === 'playing' && game.currentPlayerId === 'system_bot' && game.hostId === user.uid) {
      // Bot's turn
      const timer = setTimeout(() => {
        const size = game.boardSize;
        const allLines = [];
        for (let r = 0; r <= size; r++) {
          for (let c = 0; c < size; c++) allLines.push(`H_${r}_${c}`);
        }
        for (let r = 0; r < size; r++) {
          for (let c = 0; c <= size; c++) allLines.push(`V_${r}_${c}`);
        }
        const available = allLines.filter(l => !game.lines.includes(l));
        if (available.length > 0) {
          const linesSet = new Set(game.lines);
          const getBoxLines = (r: number, c: number) => [
            `H_${r}_${c}`,
            `H_${r + 1}_${c}`,
            `V_${r}_${c}`,
            `V_${r}_${c + 1}`
          ];

          let move = null;

          // 1. Can we close a box?
          for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
              const boxLines = getBoxLines(r, c);
              const unplayed = boxLines.filter(l => !linesSet.has(l));
              if (unplayed.length === 1) {
                move = unplayed[0];
                break;
              }
            }
            if (move) break;
          }

          // 2. Safe moves (does not give a box away)
          if (!move) {
            const safeMoves = available.filter(l => {
              const parts = l.split('_');
              const type = parts[0];
              const r = parseInt(parts[1], 10);
              const c = parseInt(parts[2], 10);
              const boxesToCheck = [];
              if (type === 'H') {
                if (r > 0) boxesToCheck.push(getBoxLines(r - 1, c));
                if (r < size) boxesToCheck.push(getBoxLines(r, c));
              } else {
                if (c > 0) boxesToCheck.push(getBoxLines(r, c - 1));
                if (c < size) boxesToCheck.push(getBoxLines(r, c));
              }
              for (const boxLines of boxesToCheck) {
                const playedInBox = boxLines.filter(bl => linesSet.has(bl)).length;
                if (playedInBox === 2) return false;
              }
              return true;
            });
            if (safeMoves.length > 0) {
              move = safeMoves[Math.floor(Math.random() * safeMoves.length)];
            }
          }

          // 3. Random fallback
          if (!move) {
            move = available[Math.floor(Math.random() * available.length)];
          }

          processMove(move, 'system_bot');
        }
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [game, user.uid]);

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-4">{error}</p>
        <button onClick={() => navigate('/')} className="text-indigo-400 hover:underline">Voltar para a Tela Inicial</button>
      </div>
    );
  }

  if (!game) {
    return <div className="text-center py-20 text-slate-500 font-mono animate-pulse">Carregando tabuleiro...</div>;
  }

  const isPlayer = user.uid === game.hostId || user.uid === game.guestId;

  return (
    <div className="max-w-3xl mx-auto animate-in zoom-in-95 duration-500">
      
      {/* Header Stats */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 mb-8 flex items-center justify-between shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none"></div>
        <div className={cn(
          "flex flex-col items-center p-3 sm:p-5 rounded-2xl transition-all duration-300 relative z-10 w-28 sm:w-36",
          game.currentPlayerId === game.hostId ? "bg-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.2)] border border-indigo-500/50 scale-105" : "bg-slate-800/30 border border-slate-700/50 opacity-70"
        )}>
          <span className="text-indigo-300 font-mono text-xs sm:text-sm mb-1 px-2 text-center truncate w-full">{game.hostName} {game.hostId === user.uid && "(Você)"}</span>
          <span className={cn(
            "text-3xl sm:text-5xl font-black tracking-tighter",
            game.currentPlayerId === game.hostId ? "text-indigo-100" : "text-white"
          )}>{game.scoreHost}</span>
        </div>
        
        <div className="flex flex-col items-center relative z-10 px-2 sm:px-4 flex-1">
          {game.status === 'waiting' && <span className="text-slate-400 animate-pulse font-mono bg-slate-800 px-4 py-1.5 rounded-full text-xs sm:text-sm border border-slate-700 whitespace-nowrap">Aguardando...</span>}
          {game.status === 'playing' && (
             <span className={cn(
               "font-mono px-4 sm:px-6 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold tracking-wider uppercase transition-colors whitespace-nowrap",
               game.currentPlayerId === user.uid 
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]" 
                  : "bg-slate-800 text-slate-400 border border-slate-700"
             )}>
               {game.currentPlayerId === user.uid ? "Sua Vez" : "Aguarde"}
             </span>
          )}
          {game.status === 'finished' && (
            <div className="text-center w-full">
              <span className="text-yellow-400 font-bold tracking-widest uppercase text-base sm:text-lg drop-shadow-md">Fim de Jogo</span>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 sm:mt-2 font-medium bg-slate-800/80 px-3 py-1 rounded-full inline-block border border-slate-700">
                {game.winnerId === user.uid ? "🏆 Você Venceu!" : (game.winnerId ? "💀 Você Perdeu" : "🤝 Empate!")}
              </p>
            </div>
          )}
        </div>

        <div className={cn(
          "flex flex-col items-center p-3 sm:p-5 rounded-2xl transition-all duration-300 relative z-10 w-28 sm:w-36",
          game.currentPlayerId === game.guestId ? "bg-rose-500/20 shadow-[0_0_30px_rgba(244,63,94,0.2)] border border-rose-500/50 scale-105" : "bg-slate-800/30 border border-slate-700/50 opacity-70"
        )}>
          <span className="text-rose-300 font-mono text-xs sm:text-sm mb-1 px-2 text-center truncate w-full">{game.guestName || '...'} {game.guestId === user.uid && "(Você)"}</span>
          <span className={cn(
            "text-3xl sm:text-5xl font-black tracking-tighter",
            game.currentPlayerId === game.guestId ? "text-rose-100" : "text-white"
          )}>{game.scoreGuest}</span>
        </div>
      </div>

      {/* Board */}
      <div className="flex justify-center select-none w-full px-2 sm:px-0">
        <div className="relative w-full max-w-[100vw] sm:max-w-[80vw] md:max-w-[600px] aspect-square bg-[#0f172a] sm:bg-slate-900 sm:border border-slate-800 p-2 sm:p-6 md:p-8 sm:rounded-[2.5rem] sm:shadow-[0_0_50px_rgba(0,0,0,0.6)] overflow-hidden flex items-center justify-center touch-none">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800/40 via-slate-900/10 to-transparent pointer-events-none"></div>
          {renderBoard(game, user.uid, handleLineClick)}
          
          {!isPlayer && game.status === 'playing' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
              <span className="text-white font-medium bg-slate-900 px-6 py-3 rounded-full border border-slate-700 shadow-xl">Assistindo</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-8 text-center">
         <button onClick={handleLeaveGame} className="text-slate-500 hover:text-slate-300 transition-colors font-mono text-sm">
           &larr; {game.status === 'waiting' && game.hostId === user.uid ? 'Cancelar Partida' : 'Sair da Partida'}
         </button>
      </div>

    </div>
  );
}

function renderBoard(game: Game, uid: string, onLineClick: (l: string) => void) {
  const size = game.boardSize;
  const dotRadius = 6;
  const lineBreadth = 12;
  const lineLength = 50;
  const cellSize = lineLength + lineBreadth;
  const padding = 16;
  const boardSizePx = size * cellSize + padding * 2;

  const linesSet = new Set(game.lines);
  const boxesMap = new Map();
  game.boxes.forEach(b => {
    const parts = b.split('_');
    boxesMap.set(`${parts[0]}_${parts[1]}`, parts.slice(2).join('_'));
  });

  const getDotCenter = (r: number, c: number) => ({
    x: padding + c * cellSize,
    y: padding + r * cellSize
  });

  const elements = [];

  // 1. Box Fills
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const p = getDotCenter(r, c);
      const owner = boxesMap.get(`${r}_${c}`);
      let fill = "transparent";
      if (owner) {
        fill = owner === game.hostId ? "rgba(99, 102, 241, 0.4)" : "rgba(244, 63, 94, 0.4)";
      }
      elements.push(
        <rect
          key={`B_${r}_${c}`}
          x={p.x + lineBreadth / 2}
          y={p.y + lineBreadth / 2}
          width={lineLength}
          height={lineLength}
          fill={fill}
          className="transition-all duration-500"
          rx={4}
        />
      );
    }
  }

  // 2. Line Tracks (Background)
  // Horizontal
  for (let r = 0; r <= size; r++) {
    for (let c = 0; c < size; c++) {
      const p = getDotCenter(r, c);
      elements.push(
        <rect
          key={`TH_${r}_${c}`}
          x={p.x + lineBreadth / 2}
          y={p.y - lineBreadth / 4}
          width={lineLength}
          height={lineBreadth / 2}
          fill="#1e293b"
          className="pointer-events-none"
          rx={lineBreadth / 4}
        />
      );
    }
  }
  // Vertical
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size; c++) {
      const p = getDotCenter(r, c);
      elements.push(
        <rect
          key={`TV_${r}_${c}`}
          x={p.x - lineBreadth / 4}
          y={p.y + lineBreadth / 2}
          width={lineBreadth / 2}
          height={lineLength}
          fill="#1e293b"
          className="pointer-events-none"
          rx={lineBreadth / 4}
        />
      );
    }
  }

  // 3. Clickable Lines
  // Horizontal
  for (let r = 0; r <= size; r++) {
    for (let c = 0; c < size; c++) {
      const p = getDotCenter(r, c);
      const lineId = `H_${r}_${c}`;
      const isActive = linesSet.has(lineId);
      elements.push(
        <rect
          key={lineId}
          x={p.x + lineBreadth / 2}
          y={p.y - lineBreadth / 2}
          width={lineLength}
          height={lineBreadth}
          fill={isActive ? "#94a3b8" : "transparent"}
          className={cn(
            "cursor-pointer transition-colors duration-200",
            isActive ? "" : "hover:fill-slate-600"
          )}
          rx={lineBreadth / 2}
          onClick={() => onLineClick(lineId)}
        />
      );
    }
  }
  // Vertical
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size; c++) {
      const p = getDotCenter(r, c);
      const lineId = `V_${r}_${c}`;
      const isActive = linesSet.has(lineId);
      elements.push(
        <rect
          key={lineId}
          x={p.x - lineBreadth / 2}
          y={p.y + lineBreadth / 2}
          width={lineBreadth}
          height={lineLength}
          fill={isActive ? "#94a3b8" : "transparent"}
          className={cn(
            "cursor-pointer transition-colors duration-200",
            isActive ? "" : "hover:fill-slate-600"
          )}
          rx={lineBreadth / 2}
          onClick={() => onLineClick(lineId)}
        />
      );
    }
  }

  // 4. Dots
  for (let r = 0; r <= size; r++) {
    for (let c = 0; c <= size; c++) {
      const p = getDotCenter(r, c);
      elements.push(
        <circle
          key={`D_${r}_${c}`}
          cx={p.x}
          cy={p.y}
          r={dotRadius}
          fill="#f8fafc"
          className="pointer-events-none drop-shadow-md"
        />
      );
    }
  }

  return (
    <svg 
      width="100%" 
      height="100%" 
      viewBox={`0 0 ${boardSizePx} ${boardSizePx}`}
      className="block flex-shrink-0 drop-shadow-lg relative z-10 max-h-full max-w-full"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {elements}
    </svg>
  );
}
