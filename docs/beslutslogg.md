# Matkoll – beslutslogg

Beslut som fattats under bygget: vad, varför och vilka alternativ som fanns. Nyaste överst.

## 2026-10-25 – GitHub-repot är publikt

- **Beslut:** `Snowstar66/matkoll` får vara publikt, trots att `autonomi.md` säger privat. Beslutat av Pontus.
- **Varför:** Pontus val; inget i underlaget är känsligt.
- **Konsekvens:** hemlighetsskanningen (vid commit och i CI) är extra viktig, eftersom allt som pushas blir synligt direkt. Inga hemligheter, personuppgifter eller riktiga ICA-uppgifter utöver butiks-id får committas.
- **Alternativ:** privat repo (ursprunglig standard i `autonomi.md`).

## 2026-10-25 – Lokal utvecklingsmiljö

- **Beslut:** OrbStack som Docker-motor för lokal Supabase. `gh`, `pnpm` (via corepack) och Supabase CLI installerade i `~/.local/bin`, eftersom Homebrew saknas och `/usr/local/bin` kräver administratörsrättigheter.
- **Varför:** OrbStack är lättare än Docker Desktop på Mac. Kubernetes och Linux-maskiner i OrbStack behövs inte.
- **OrbStack-inställningar:** start vid inloggning på; `docker.expose_ports_to_lan` och `machines.expose_ports_to_lan` av, så att lokal Supabase (med standardlösenord) inte nås från andra på samma nätverk.
- **Alternativ:** Docker Desktop; Supabase i molnet redan under utveckling (skulle frångå ordningen i `autonomi.md`).
