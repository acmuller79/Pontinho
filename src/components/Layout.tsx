import { Link, Outlet } from 'react-router';
import { User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from '../firebase';

interface LayoutProps {
  user: User | null;
}

export function Layout({ user }: LayoutProps) {
  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Error signing in', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      <header className="border-b border-slate-800 bg-slate-900/50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block animate-pulse"></span>
            Pontinhos
          </Link>
          
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link to="/leaderboard" className="text-slate-400 hover:text-indigo-400 transition-colors">
              Placares
            </Link>
            
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-slate-500 font-mono text-xs">{user.displayName}</span>
                <button 
                  onClick={handleLogout}
                  className="px-4 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700"
                >
                  Sair
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all"
              >
                Entrar com Google
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 md:p-12">
        <Outlet />
      </main>
    </div>
  );
}
