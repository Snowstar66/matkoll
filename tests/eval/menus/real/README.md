# Riktiga menyfoton

Lägg egna foton av riktiga menyer här (`.jpg`, `.jpeg` eller `.png`, helst nedskalade till cirka 1600 px på längsta sidan, under 1,5 MB). Filerna ignoreras av git (repot är publikt).

`pnpm eval:menu` kör dem utan facit och sparar bara utdata per konfiguration i `tests/eval/menu-read-results/<konfiguration>/real-<filnamn>.run<N>.json` för ögonkontroll. De ingår inte i poängtabellen i `tests/eval/menu-read-report.md`.

Kör bara riktiga foton: `pnpm eval:menu -- --only=real --runs=1`.
