import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FlameButton } from "@/components/ui/FlameButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Gamepad2, RotateCcw, X, Circle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type Cell = "X" | "O" | null;
type Board = Cell[];
type Difficulty = "easy" | "medium" | "flame";
type Starter = "player" | "ai";

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

function emptyCells(b: Board): number[] {
  const out: number[] = [];
  for (let i = 0; i < 9; i++) if (!b[i]) out.push(i);
  return out;
}

// Medium AI: block/win if 1-move, otherwise random
function mediumMove(b: Board): number {
  // Try to win
  for (const i of emptyCells(b)) {
    const c = [...b]; c[i] = "O";
    if (checkWinner(c) === "O") return i;
  }
  // Block player
  for (const i of emptyCells(b)) {
    const c = [...b]; c[i] = "X";
    if (checkWinner(c) === "X") return i;
  }
  const cells = emptyCells(b);
  return cells[Math.floor(Math.random() * cells.length)];
}

function aiMove(b: Board, difficulty: Difficulty): number {
  if (difficulty === "easy") {
    const cells = emptyCells(b);
    return cells[Math.floor(Math.random() * cells.length)];
  }
  if (difficulty === "medium") return mediumMove(b);
  return minimax([...b], true).idx;
}

interface MiniGamesProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function MiniGames({ open, onOpenChange }: MiniGamesProps) {
  const { t } = useLanguage();
  const [view, setView] = useState<"menu" | "setup" | "ttt">("menu");
  const [difficulty, setDifficulty] = useState<Difficulty>("flame");
  const [starter, setStarter] = useState<Starter>("player");
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
      const idx = aiMove(board, difficulty);
      if (idx === -1 || idx === undefined) return;
      const next = [...board];
      next[idx] = "O";
      setBoard(next);
      setTurn("X");
    }, 450);
    return () => clearTimeout(id);
  }, [view, turn, board, winner, difficulty]);

  const playerMove = (i: number) => {
    if (board[i] || winner || turn !== "X") return;
    const next = [...board];
    next[i] = "X";
    setBoard(next);
    setTurn("O");
  };

  const startMatch = () => {
    setBoard(Array(9).fill(null));
    setTurn(starter === "player" ? "X" : "O");
    setView("ttt");
  };

  const reset = () => {
    setBoard(Array(9).fill(null));
    setTurn(starter === "player" ? "X" : "O");
  };

  const statusText =
    winner === "X" ? t("youWin") :
    winner === "O" ? t("aiWins") :
    winner === "draw" ? t("draw") :
    turn === "X" ? t("yourTurn") : t("aiTurn");

  const difficultyLabel = (d: Difficulty) =>
    d === "easy" ? t("difficultyEasy") : d === "medium" ? t("difficultyMedium") : t("difficultyFlame");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md glass-card border-primary/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-glow">
            <Gamepad2 className="w-5 h-5 text-primary" />
            {view === "menu" ? t("miniGames") : t("ticTacToe")}
          </DialogTitle>
        </DialogHeader>

        {view === "menu" && (
          <div className="space-y-2 py-2">
            <GlassCard
              className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setView("setup")}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center neon-glow-sm">
                  <Circle className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{t("ticTacToe")}</h3>
                  <p className="text-xs text-muted-foreground">vs Flame AI</p>
                </div>
              </div>
            </GlassCard>
            <p className="text-[11px] text-muted-foreground text-center pt-2">{t("moreSoon")}</p>
          </div>
        )}

        {view === "setup" && (
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-medium mb-2">{t("difficulty")}</p>
              <div className="grid grid-cols-3 gap-2">
                {(["easy", "medium", "flame"] as Difficulty[]).map(d => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${difficulty === d ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(127,90,240,0.5)]" : "bg-muted/40 text-muted-foreground hover:bg-muted/60"}`}>
                    {difficultyLabel(d)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">{t("whoStarts")}</p>
              <div className="grid grid-cols-2 gap-2">
                {(["player", "ai"] as Starter[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setStarter(s)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${starter === s ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted/60"}`}>
                    {s === "player" ? t("playerFirst") : t("aiFirst")}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <FlameButton variant="ghost" onClick={() => setView("menu")} size="md">
                <X className="w-4 h-4" />
              </FlameButton>
              <FlameButton onClick={startMatch} className="flex-1" size="md">
                {t("startGame")}
              </FlameButton>
            </div>
          </div>
        )}

        {view === "ttt" && (
          <div className="space-y-4 py-2">
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-primary">{statusText}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{difficultyLabel(difficulty)}</p>
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
              <FlameButton onClick={() => setView("setup")} variant="outline" size="md">
                {t("difficulty")}
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
