# Matkoll – arbetsregler för autonomt bygge

Pontus vill att BMAD och Claude Code arbetar med hög autonomi och helst inte frågar något förrän arbetet är klart. Den här filen ger de regler och standardval som behövs för det. Läs den före `docs/brief.md` och `docs/ux/ux-spec.md`.

## Grundregel

Fatta själv alla beslut som går att ändra senare. Välj det enklaste alternativet som uppfyller briefen, dokumentera valet i `docs/beslutslogg.md` (vad, varför, alternativ) och gå vidare. Fråga inte om sådant som står här eller går att härleda ur briefen.

## Stanna och fråga bara om

- något kräver Pontus konton, inloggning, betalning eller hemligheter (se "Det som kräver Pontus");
- ett beslut går emot briefen, effektmålen eller designprincipen;
- en ändring är svår att ångra: radering av data, ändring av git-historik, publicering i produktion;
- en säkerhetskontroll från AAS-avsnittet skulle behöva stängas av eller kringgås;
- samma blockering kvarstår efter tre egna lösningsförsök.

Samla i övrigt alla frågor och osäkerheter i `docs/oppna-fragor.md` och presentera dem tillsammans när arbetet är klart.

## Standardval (ändras bara om briefen säger annat)

| Område | Val |
| --- | --- |
| Språk i gränssnittet | Svenska |
| Språk i kod, kommentarer och commit-meddelanden | Engelska |
| Ramverk | Next.js (App Router) med TypeScript i strikt läge |
| Styling | Tailwind CSS med designtokens från `docs/ux/ux-spec.md`; inget tungt komponentbibliotek |
| Pakethanterare | pnpm |
| Databas och inloggning | Supabase; lokal Supabase via Supabase CLI under utveckling |
| Inloggning | E-post med engångslänk (magic link); en användare |
| Validering | Zod för alla AI-svar och formulärdata |
| AI-klient | Vercel AI SDK bakom ett eget gränssnitt (tolka recept, analysera bild, föreslå rätter) |
| Tester | Vitest för logik, Playwright för de viktigaste flödena |
| CI | GitHub Actions med lint, typkontroll, tester, hemlighetsskanning och RLS-tester |
| Butiksavdelningar | Frukt och grönt, Bröd, Mejeri, Kött och fisk, Chark, Frys, Skafferi, Dryck, Övrigt |
| Ingredienskatalog | Byggs löpande: AI föreslår normaliserat namn, avdelning och plats vid import; ingen förifylld databas krävs |
| Plats i lagret | Kyl, Frys, Skafferi; föreslås automatiskt från ingredienskatalogen |
| Ej skissade skärmar (Matsedel, Laga mat, mörkt läge) | Följ mönster, tokens och komponenter från de skissade skärmarna |
| Byggordning | Epic 1–3 först (fungerande kärna), därefter 4–7 |

## Ordning för GitHub och driftsättning

- Repot `matkoll` på GitHub är privat och används från första dagen: backup, historik och CI.
- Varje epic byggs i en egen gren och slås ihop via pull request när alla kontroller passerar.
- Vercel och Supabase i molnet sätts upp först när Epic 1–3 fungerar lokalt. Fram till dess körs allt lokalt.

## Bygg utan att vänta på Pontus konton

- Använd lokal Supabase under utveckling. Skapa migrationer och RLS-policyer som kan köras mot molnprojektet senare.
- Under utveckling på Pontus Mac anropas LM Studio direkt på `http://localhost:1234` (OpenAI-kompatibelt API). Tunneln behövs först när appen körs på Vercel.
- Bygg en mock-leverantör för AI-gränssnittet så att tester och CI fungerar utan modell.
- Epic 7: bygg exportformatet och knappen "Skicka till ICA". Själva varukorgen fylls av Claude in Chrome och testas av Pontus.
- Lägg alla hemligheter i `.env.local` (aldrig i repot) och dokumentera nödvändiga variabler i `.env.example`.

## Det som kräver Pontus (samla i en checklista till slutet)

- Skapa Supabase-projekt och Vercel-projekt med namnet `matkoll` och lägga in miljövariabler (efter Epic 1–3).
- Sätta upp Cloudflare Tunnel och Cloudflare Access (kräver domän).
- Testa Epic 7 mot ICA Handla med sin inloggning.
- Definiera eller bekräfta testuppsättningen med riktiga recept och kylskåpsfoton.

## Klart betyder

- Epic 1–6 fungerar lokalt end-to-end; Epic 7 har export och knapp.
- Alla tvingande kontroller i AAS-avsnittet passerar i CI.
- `docs/beslutslogg.md`, `docs/oppna-fragor.md` och checklistan för Pontus är uppdaterade.
- En kort sammanfattning: vad som byggts, vad som återstår och hur Pontus startar appen lokalt.
