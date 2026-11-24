export function isConversationPath(path: string) {
  return /^\/(chats|messages)\/[^/]+\/?$/.test(path);
}
export function dockGesture(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dy) < 28 || Math.abs(dy) <= Math.abs(dx)) return null;
  return dy > 0 ? "hide" : "restore";
}