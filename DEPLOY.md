# Slap — deploy notes

App: https://lrn1.github.io/slap/

Files served: index.html (app + storage adapter + SW registration),
sw.js (offline cache), manifest.webmanifest, 3 icons.

RULE: every app update = new index.html AND new sw.js with a bumped
CACHE version ("slap-v2", "slap-v3", ...). Claude emits both together;
upload both. Updates apply on the SECOND launch after upload (first
launch fetches the new version in the background).

After any commit: check Actions for a green "pages build and deployment".

Dev material (tests, archive, future native app): private repo slap-dev.
