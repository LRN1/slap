# Slap PWA — deploy notes (v1, board-i29 inside)
Files: index.html (the app + storage adapter + SW registration),
sw.js (offline cache, version "slap-v1"), manifest.webmanifest, 3 icons.
RULE: every future app update = new index.html AND new sw.js with a bumped
CACHE version ("slap-v2", ...). Claude emits both together; upload both.
Updates apply on the SECOND launch after upload (first launch fetches the new
version in the background).
Data migration from the artifact app: old app → Menu → Backup (copies JSON)
→ new PWA → Menu → Restore (paste). Do this ONCE, then retire the artifact copy.
