export interface UserProfile {
  displayName: string;
  wins: number;
  monthlyWins?: Record<string, number>;
  createdAt: any; 
}

export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface Game {
  id?: string;
  status: GameStatus;
  boardSize: number;
  hostId: string;
  hostName: string;
  guestId?: string | null;
  guestName?: string | null;
  currentPlayerId?: string | null;
  winnerId?: string | null;
  scoreHost: number;
  scoreGuest: number;
  lines: string[];
  boxes: string[];
  scoreClaimed: boolean;
  createdAt: any;
  updatedAt: any;
}
