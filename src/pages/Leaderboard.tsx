import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

interface RankedUser extends UserProfile {
  id: string;
}

export function Leaderboard() {
  const [leaders, setLeaders] = useState<RankedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchLeaders() {
      try {
        const q = query(
          collection(db, 'users'),
          orderBy('wins', 'desc'),
          limit(50)
        );
        const snapshot = await getDocs(q);
        const users: RankedUser[] = [];
        snapshot.forEach(doc => {
          users.push({ id: doc.id, ...doc.data() } as RankedUser);
        });
        setLeaders(users);
      } catch (err: any) {
        if (err.message?.includes('index')) {
          setError('O índice do placar está sendo criado, verifique novamente mais tarde.');
        } else {
          setError('Falha ao carregar placares.');
          console.error(err);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchLeaders();
  }, []);

  return (
    <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-10">
         <h1 className="text-4xl font-bold text-white tracking-tight">Ranking Global</h1>
         <p className="text-slate-400 mt-2">Os 50 melhores jogadores em vitórias.</p>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 font-mono py-12 animate-pulse">Carregando ranking...</div>
      ) : error ? (
        <div className="text-center text-red-400 py-12">{error}</div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {leaders.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Nenhum jogador classificado ainda. Jogue uma partida para entrar no placar!</div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-800/50 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-mono text-xs text-slate-400 uppercase tracking-wider w-16 text-center">Posição</th>
                  <th className="px-6 py-4 font-mono text-xs text-slate-400 uppercase tracking-wider">Jogador</th>
                  <th className="px-6 py-4 font-mono text-xs text-slate-400 uppercase tracking-wider text-right">Vitórias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {leaders.map((user, idx) => (
                  <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-slate-500 text-center text-sm">
                      #{idx + 1}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/20">
                            {user.displayName.charAt(0).toUpperCase()}
                         </div>
                         <span className="text-slate-200 font-medium">{user.displayName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">
                      {user.wins}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
