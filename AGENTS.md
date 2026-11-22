# Architecture rules
- Keep signed-in routes under `AppShell` and derive navigation from canonical route helpers; shared links and ordinary navigation must open the same views.
- Keep call coordination in the shell-scoped `CallingProvider`, not chat view instances; incoming calls must work on every signed-in tab.
- Persist SDP and per-participant ICE in access-controlled application tables; explicit acceptance plus peer connection drives call duration.
- Stop local media tracks and close peer connections on every call exit; mute controls track.enabled rather than decorative state.
- Marketplace balance, ownership, listing and escrow mutations must use atomic server-side operations; clients must never credit unverified payments.
- Preserve the existing collectible table names for compatibility; render their real catalog and inventory rather than demo assets or accounts.
- Subscribe to post deletions in feed, profile and shared-post views so administrator moderation propagates without a reload.
- Scope mini-app message bridges to their own iframe window and sandbox generated code without same-origin access to account storage.
- Lovable hosting supplies SPA fallback automatically; `vercel.json` is only for compatibility if exported to Vercel.