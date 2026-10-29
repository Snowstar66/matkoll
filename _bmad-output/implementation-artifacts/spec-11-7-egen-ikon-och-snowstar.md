---
title: 'Story 11.7: Egen ikon och Snowstar'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
---

## Intent

**Problem:** Appikonen var en morot som inte hörde ihop med Matkoll, och appen sa inte vem som gjort den.

**Approach:** Konceptet "Burken" (skafferiburk med bock) ersätter moroten överallt, och "Matkoll · av Snowstar" står diskret längst ned på inloggningen och i Inställningar.

## Ändringar

- `app-icon-image.tsx`: ritar burken i en 512-vy med `ImageResponse` (samma metod som 11.6). `any` 192/512 har rundad ruta (`rx` 112), `maskable` och Apple-ikonen har kantlös ruta. Grönt tas från `appIconColors.accent` (#3E7C62).
- `app-info.ts`: `motifScale` är `regular` 1, `apple` 0,92 och `maskable` 0,8 (inom säkra zonen). `icon.tsx` och `apple-icon.tsx` skickar skala och form.
- `favicon.ico`: ny, 32 och 48 px (PNG i ICO), förenklad burk med större lock och tjockare bock (stroke 56) för läsbarhet.
- `logga-in/page.tsx` och `installningar/page.tsx`: `<p className="text-meta text-ink-3">Matkoll · av Snowstar</p>` (kontrast som övrig dämpad text, vanlig text för skärmläsare).
- `epics.md` och `sprint-status.yaml` uppdaterade. Manifest och tester oförändrade (samma id, storlekar och purpose).

## Verifiering

lint, typecheck, `pnpm test`, `AI_PROVIDER=mock pnpm build`, e2e `app-install`, `auth`, `settings`. 512-ikonen, den maskbara och favicon 48 renderades och granskades visuellt. Ingen migration, inget nätverk.

## Review Triage Log

Ingen separat granskning. Egen genomgång: de oanvända sand-färgerna i `appIconColors` lämnades kvar eftersom `tests/design/contrast.test.ts` låser dem mot DESIGN.md. Inget annat att rätta.
