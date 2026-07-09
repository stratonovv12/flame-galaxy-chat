import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { Flame, X as XIcon, Gamepad2 } from "lucide-react";

/**
 * Tic-Tac-Toe over DMs. Game state lives in the direct_messages log
 * using text markers so no extra schema is required:
 *   [[TTT_INVITE:<gameId>]]
 *   [[TTT_MOVE:<gameId>:<cellIndex>]]
 *   [[TTT_RESIGN:<gameId>]]
 * The inviter always plays X, the receiver plays O.
 */

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

type Cell = "X" | "O" | null;

export interface TTTGameState {
  gameId: string;
  inviterId: string;
  board: Cell[];
  turn: "X" | "O";
  moves: number;
  winner: Cell | "draw" | null;
  resignedBy: string | null;
}

export function parseTTTMessages(
  messages: { id: string; sender_id: string; content: string }[]
): Map<string, TTTGameState> {
  const games = new Map<string, TTTGameState>();
  for (const m of messages) {
    const inv = m.content.match(/^\[\[TTT_INVITE:([\w-]+)\]\]/);
    if (inv) {
      games.set(inv[1], {
        gameId: inv[1],
        inviterId: m.sender_id,
        board: Array(9).fill(null),
        turn: "X",
        moves: 0,
        winner: null,
        resignedBy: null,
      });
      continue;
    }
    const mv = m.content.match(/^\[\[TTT_MOVE:([\w-]+):(\d)\]\]/);
    if (mv) {
      const g = games.get(mv[1]);
      if (!g || g.winner || g.resignedBy) continue;
      const idx = parseInt(mv[2], 10);
      if (g.board[idx] != null) continue;
      const mark: Cell = m.sender_id === g.inviterId ? "X" : "O";
      if (mark !== g.turn) continue;
      g.board[idx] = mark;
      g.moves++;
      // check winner
      for (const [a, b, c] of WIN_LINES) {
        if (g.board[a] && g.board[a] === g.board[b] && g.board[a] === g.board[c]) {
          g.winner = g.board[a];
          break;
        }
      }
      if (!g.winner && g.moves === 9) g.winner = "draw";
      g.turn = g.turn === "X" ? "O" : "X";
      continue;
    }
    const rs = m.content.match(/^\[\[TTT_RESIGN:([\w-]+)\]\]/);
    if (rs) {
      const g = games.get(rs[1]);
      if (g && !g.winner) {
        g.resignedBy = m.sender_id;
        g.winner = m.sender_id === g.inviterId ? "O" : "X";
      }
    }
  }
  return games;
}

export function isTTTMarker(content: string): boolean {
  return /^\[\[TTT_(INVITE|MOVE|RESIGN):/.test(content);
}

export async function sendTTTInvite(senderId: string, receiverId: string) {
  const gameId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const { error } = await supabase.from("direct_messages").insert({
    sender_id: senderId,
    receiver_id: receiverId,
    content: `[[TTT_INVITE:${gameId}]]`,
  });
  return { gameId, error };
}

export async function sendTTTMove(
  senderId: string,
  receiverId: string,
  gameId: string,
  cell: number
) {
  await supabase.from("direct_messages").insert({
    sender_id: senderId,
    receiver_id: receiverId,
    content: `[[TTT_MOVE:${gameId}:${cell}]]`,
  });
}

export async function sendTTTResign(
  senderId: string,
  receiverId: string,
  gameId: string
) {
  await supabase.from("direct_messages").insert({
    sender_id: senderId,
    receiver_id: receiverId,
    content: `[[TTT_RESIGN:${gameId}]]`,
  });
}

/** Inline card rendered inside the chat bubble for TTT markers. */
export function TTTMessageCard({
  message,
  games,
  partnerId,
  ghostMode,
  onOpen,
}: {
  message: { id: string; sender_id: string; content: string };
  games: Map<string, TTTGameState>;
  partnerId: string;
  ghostMode: boolean;
  onOpen: (gameId: string) => void;
}) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const gameId = message.content.match(/^\[\[TTT_[A-Z]+:([\w-]+)/)?.[1];
  if (!gameId) return null;
  const game = games.get(gameId);
  if (!game) return null;
  const isInviter = user?.id === game.inviterId;
  const mySymbol: "X" | "O" = isInviter ? "X" : "O";

  const statusText = game.winner
    ? game.winner === "draw"
      ? t("draw")
      : game.winner === mySymbol
      ? t("youWin")
      : t("tttPartnerWon")
    : game.turn === mySymbol
    ? t("yourTurn")
    : t("tttOpponentTurn");

  return (
    <button
      onClick={() => onOpen(gameId)}
      className={`w-full text-left rounded-xl p-3 flex items-center gap-3 border transition-all ${
        ghostMode
          ? "bg-zinc-800/70 border-zinc-600/60 hover:bg-zinc-700/70"
          : "bg-gradient-to-br from-orange-500/15 to-red-500/15 border-orange-400/40 hover:from-orange-500/25 hover:to-red-500/25"
      }`}
    >
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
          ghostMode
            ? "bg-zinc-700 text-zinc-200"
            : "bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-[0_0_14px_rgba(249,115,22,0.55)]"
        }`}
      >
        {ghostMode ? <Gamepad2 className="w-5 h-5" /> : <Flame className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${ghostMode ? "text-zinc-100" : ""}`}>
          {t("ticTacToe")}
        </p>
        <p className={`text-xs ${ghostMode ? "text-zinc-400" : "text-muted-foreground"}`}>
          {statusText}
        </p>
      </div>
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
        ghostMode ? "bg-zinc-700 text-zinc-200" : "bg-orange-500/20 text-orange-300"
      }`}>
        {isInviter ? t("tttYouAreX") : t("tttYouAreO")}
      </span>
    </button>
  );
}

/** Full-screen bottom sheet overlay to play a game. */
export function TTTGameOverlay({
  gameId,
  games,
  partnerId,
  partnerName,
  ghostMode,
  onClose,
}: {
  gameId: string;
  games: Map<string, TTTGameState>;
  partnerId: string;
  partnerName: string;
  ghostMode: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const game = games.get(gameId);

  const state = useMemo(() => {
    if (!game || !user) return null;
    const isInviter = user.id === game.inviterId;
    const mySymbol: "X" | "O" = isInviter ? "X" : "O";
    const myTurn = !game.winner && game.turn === mySymbol;
    return { game, isInviter, mySymbol, myTurn };
  }, [game, user]);

  if (!state) {
    return (
      <div className="fixed inset-0 z-[95] bg-black/70 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
        <GlassCard className="w-full sm:max-w-md m-0 sm:m-4 rounded-t-2xl sm:rounded-2xl p-6 text-center" onClick={e => e.stopPropagation()}>
          <p className="text-muted-foreground">…</p>
        </GlassCard>
      </div>
    );
  }

  const { game: g, mySymbol, myTurn } = state;

  const status = g.winner
    ? g.winner === "draw"
      ? t("draw")
      : g.winner === mySymbol
      ? t("youWin")
      : t("tttPartnerWon")
    : myTurn
    ? t("yourTurn")
    : t("tttOpponentTurn");

  const cellClick = async (i: number) => {
    if (!user || g.board[i] || g.winner || !myTurn) return;
    await sendTTTMove(user.id, partnerId, gameId, i);
  };

  const resign = async () => {
    if (!user || g.winner) return;
    await sendTTTResign(user.id, partnerId, gameId);
  };

  const shellClass = ghostMode
    ? "bg-zinc-950 border-zinc-700 text-zinc-100"
    : "bg-background border-orange-500/40";

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/70 flex items-end sm:items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border ${shellClass} shadow-2xl p-5 space-y-4 animate-slide-in-right`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              ghostMode
                ? "bg-zinc-800 text-zinc-200"
                : "bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-[0_0_16px_rgba(249,115,22,0.5)]"
            }`}
          >
            {ghostMode ? <Gamepad2 className="w-5 h-5" /> : <Flame className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base truncate">{t("ticTacToe")}</h3>
            <p className={`text-xs truncate ${ghostMode ? "text-zinc-400" : "text-muted-foreground"}`}>
              vs {partnerName}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${ghostMode ? "hover:bg-zinc-800" : "hover:bg-muted/50"}`}
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <p className={`text-center text-sm font-semibold ${
          g.winner
            ? ghostMode ? "text-zinc-200" : "text-orange-400"
            : myTurn
              ? ghostMode ? "text-zinc-100" : "text-orange-400"
              : ghostMode ? "text-zinc-500" : "text-muted-foreground"
        }`}>
          {status}
        </p>

        <div className="grid grid-cols-3 gap-2 mx-auto" style={{ width: 260 }}>
          {g.board.map((cell, i) => {
            const disabled = !!cell || !!g.winner || !myTurn;
            return (
              <button
                key={i}
                onClick={() => cellClick(i)}
                disabled={disabled}
                className={`aspect-square rounded-xl flex items-center justify-center text-4xl font-bold transition-all ${
                  ghostMode
                    ? "bg-zinc-800/60 border border-zinc-700 hover:bg-zinc-700/70 disabled:hover:bg-zinc-800/60"
                    : "bg-muted/30 border border-orange-400/20 hover:bg-orange-500/15 hover:border-orange-400/50 disabled:hover:bg-muted/30"
                } disabled:cursor-not-allowed`}
              >
                {cell === "X" && (
                  <span className={ghostMode ? "text-zinc-100" : "text-orange-400 drop-shadow-[0_0_10px_rgba(249,115,22,0.7)]"}>
                    ✕
                  </span>
                )}
                {cell === "O" && (
                  <span className={ghostMode ? "text-zinc-300" : "text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.7)]"}>
                    ◯
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!g.winner && (
          <FlameButton variant="outline" onClick={resign} className="w-full">
            {t("tttResign")}
          </FlameButton>
        )}
      </div>
    </div>
  );
}
