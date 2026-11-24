import { useEffect, useState } from "react";
const selector = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-dock-obstruction="true"], [data-active-conversation="true"]';
export function useDockVisibility() {
  const [obstructed, setObstructed] = useState(false);
  useEffect(() => {
    const check = () => setObstructed(Array.from(document.querySelectorAll<HTMLElement>(selector)).some(el => {
      if (el.dataset.state === "closed" || el.hidden) return false;
      return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
    }));
    const observer = new MutationObserver(check);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "data-dock-obstruction", "data-active-conversation", "hidden", "style"] });
    check();
    return () => observer.disconnect();
  }, []);
  return obstructed;
}