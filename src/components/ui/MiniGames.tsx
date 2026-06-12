import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FlameButton } from "@/components/ui/FlameButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Gamepad2, RotateCcw, X, Circle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type Cell = "X" | "O" | null;
type Board = Cell[];

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWinner(b: Board): Cell | "draw" | null {
  for (const [a, c, d] of WIN_LINES) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  if (b.every(Boolean)) return "draw";
  return null;
}

// Perfect-play minimax — AI is "O", player is "X"
function minimax(b: Board, isAi: boolean): { score: number; idx: number } {
  const w = checkWinner(b);
  if (w === "O") return { score: 10, idx: -1 };
  if (w === "X") return { score: -10, idx: -1 };
  if (w === "draw") return { score: 0, idx: -1 };

  let best = { score: isAi ? -Infinity : Infinity, idx: -1 };
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = isAi ? "O" : "X";
    const { score } = minimax(b, !isAi);
    b[i] = null;
    if (isAi ? score > best.score : score < best.score) best = { score, idx: i };
  }
  return best;
}

interface MiniGamesProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function MiniGames({ open, onOpenChange }: MiniGamesProps) {
  const { t } = useLanguage();
  const [view, setView] = useState<"menu" | "ttt">("menu");
  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const winner = checkWinner(board);

  useEffect(() => {
    if (!open) {
      setView("menu");
      setBoard(Array(9).fill(null));
      setTurn("X");
    }
  }, [open]);

  // AI move
  useEffect(() => {
    if (view !== "ttt" || winner || turn !== "O") return;
    const id = setTimeout(() => {
      const { idx } = minimax([...board], true);
      if (idx === -1) return;
      const next = [...board];
      next[idx] = "O";
      setBoard(next);
      setTurn("X");
    }, 450);
    return () => clearTimeout(id);
  }, [view, turn, board, winner]);

  const playerMove = (i: number) => {
    if (board[i] || winner || turn !== "X") return;
    const next = [...board];
    next[i] = "X";
    setBoard(next);
    setTurn("O");
  };

  const reset = () => { setBoard(Array(9).fill(null)); setTurn("X"); };

  const statusText =
    winner === "X" ? t("youWin") :
    winner === "O" ? t("aiWins") :
    winner === "draw" ? t("draw") :
    turn === "X" ? t("yourTurn") : t("aiTurn");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md glass-card border-primary/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-glow">
            <Gamepad2 className="w-5 h-5 text-primary" />
            {view === "menu" ? t("miniGames") : t("ticTacToe")}
          </DialogTitle>
        </DialogHeader>

        {view === "menu" ? (
          <div className="space-y-2 py-2">
            <GlassCard
              className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => { reset(); setView("ttt"); }}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center neon-glow-sm">
                  <Circle className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{t("ticTacToe")}</h3>
                  <p className="text-xs text-muted-foreground">vs FLAME AI</p>
                </div>
              </div>
            </GlassCard>
            <p className="text-[11px] text-muted-foreground text-center pt-2">{t("moreSoon")}</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="text-center">
              <p className="text-sm font-semibold text-primary">{statusText}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 mx-auto" style={{ width: 240 }}>
              {board.map((cell, i) => (
                <button
                  key={i}
                  onClick={() => playerMove(i)}
                  disabled={!!cell || !!winner || turn !== "X"}
                  className="aspect-square rounded-lg bg-muted/30 hover:bg-primary/20 border border-border flex items-center justify-center text-3xl font-bold transition-colors disabled:cursor-not-allowed"
                >
                  {cell === "X" && <span className="text-primary text-glow">✕</span>}
                  {cell === "O" && <span className="text-accent">◯</span>}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <FlameButton onClick={reset} className="flex-1" size="md">
                <RotateCcw className="w-4 h-4 mr-2" /> {t("newGame")}
              </FlameButton>
              <FlameButton onClick={() => setView("menu")} variant="ghost" size="md">
                <X className="w-4 h-4" />
              </FlameButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
