import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Game } from '../types';

interface HomeProps {
  user: User | null;
}

export function Home({ user }: HomeProps) {
  const navigate = useNavigate();
  const [waitingGames, setWaitingGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only subscribe to waiting games
    const q = query(
      collection(db, 'games'),
      where('status', '==', 'waiting'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const games: Game[] = [];
      snapshot.forEach((doc) => {
        games.push({ id: doc.id, ...doc.data() } as Game);
      });
      setWaitingGames(games);
    }, (error) => {
      console.error('Error fetching waiting games:', error);
    });

    return () => unsubscribe();
  }, []);

  const handleCreateGame = async (vsBot: boolean = false) => {
    if (!user) return;
    setLoading(true);
    try {
      const newGame: Omit<Game, 'id'> = {
        status: vsBot ? 'playing' : 'waiting',
        boardSize: 5,
        hostId: user.uid,
        hostName: user.displayName || 'Anônimo',
        ...(vsBot ? { guestId: 'system_bot', guestName: 'Computador', currentPlayerId: user.uid } : {}),
        scoreHost: 0,
        scoreGuest: 0,
        lines: [],
        boxes: [],
        scoreClaimed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      const docRef = await addDoc(collection(db, 'games'), newGame);
      navigate(`/game/${docRef.id}`);
    } catch (e) {
      console.error('Error creating game:', e);
    } finally {
      setLoading(false);
    }
  };

  const currentActiveGame = user ? waitingGames.find(g => g.hostId === user.uid) : null;

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
          Pontinhos Multiplayer
        </h1>
        <p className="text-slate-400 text-lg">
          O clássico jogo de papel e caneta online. Crie uma partida, ligue os pontos, feche o maior número de quadrados e suba nos placares globais.
        </p>
        
        {user ? (
          <div className="pt-6">
            {currentActiveGame ? (
              <button 
                onClick={() => navigate(`/game/${currentActiveGame.id}`)}
                className="px-8 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-500/20 transition-all"
              >
                Voltar para sua partida em espera
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button 
                  onClick={() => handleCreateGame(false)}
                  disabled={loading}
                  className="px-8 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
                >
                  {loading ? 'Criando...' : 'Criar Partida Online'}
                </button>
                <button 
                  onClick={() => handleCreateGame(true)}
                  disabled={loading}
                  className="px-8 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium shadow-lg shadow-slate-900/20 transition-all disabled:opacity-50 border border-slate-700"
                >
                  Jogar contra o Computador
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="pt-6 text-indigo-400 border border-indigo-500/20 bg-indigo-500/5 rounded-lg p-4 inline-block">
            Faça login para jogar online e entrar no ranking.
          </div>
        )}
      </div>

      {user && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h2 className="text-xl font-semibold text-white">Partidas Abertas</h2>
            <p className="text-sm text-slate-500 font-mono">{waitingGames.length} esperando</p>
          </div>
          
          {waitingGames.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/30 rounded-xl border border-slate-800 border-dashed">
              <p className="text-slate-500">Nenhuma partida aberta no momento. Seja o primeiro a criar uma!</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {waitingGames.map(game => (
                <div key={game.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm hover:border-indigo-500/50 transition-colors group">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-slate-400 text-sm mb-1 font-mono">Criador</p>
                      <p className="text-white font-medium truncate">{game.hostName}</p>
                    </div>
                    <div className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs font-mono">
                      {game.boardSize}x{game.boardSize}
                    </div>
                  </div>
                  
                  {game.hostId === user.uid ? (
                    <button 
                      onClick={() => navigate(`/game/${game.id}`)}
                      className="w-full py-2 rounded-lg bg-slate-800 text-slate-300 font-medium transition-colors"
                    >
                      Aguardando...
                    </button>
                  ) : (
                    <button 
                      onClick={() => navigate(`/game/${game.id}`)}
                      className="w-full py-2 rounded-lg bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white font-medium transition-all group-hover:shadow-lg group-hover:shadow-indigo-500/20"
                    >
                      Entrar na Partida
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
