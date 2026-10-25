---
review: versions-and-reality-check
target: ../ARCHITECTURE-SPINE.md
log: ../.memlog.md
date: 2026-10-25
lens: Har varje beslut kontrollerats mot webben, starterns nuvarande standardval eller registret, eller bygger det på träningsdata?
verdict: Behöver ändringar (2 höga, 4 medel, 9 låga)
---

# Granskning: versioner och verklighetskontroll

## Sammanfattning

Versionstabellen stämmer. Alla 18 paketversioner i Stack matchar npm-registret i dag. Det enda avvikande är `react`, där 19.3.1 är nyare än starterns fasta 19.3.0. Det som saknas är kontroll av **standardval** i det spinen bygger på:

1. **create-next-app 16.4.3 slår på `cacheComponents: true` och `partialPrefetching: true`.** Spinen nämner inte detta, men AD-2, AD-3 och cachekonventionen är skrivna för den äldre modellen.
2. **Supabase exponerar inte längre nya tabeller automatiskt i nya molnprojekt** (sedan 2026-05-30). Lokal CLI exponerar dem fortfarande som standard. Schemat fungerar alltså lokalt och i CI, men ger `42501` i molnet.

Dessutom är flera API-val i AI-porten, inloggningen och bildflödet inte kontrollerade, och några av dem stämmer inte med dagens bibliotek eller plattformsgränser.

Bevisen nedan kommer från `npm view` och nedladdade paket (`npm pack`), dokumentationen för Next 16.4.3 i `node_modules/next/dist/docs`, scaffolden från create-next-app 16.4.3, en `supabase init` med CLI 2.122.0, GitHubs advisory-API och leverantörernas dokumentation (hämtad 2026-10-25).

---

## Fynd

### V-1 · Hög · Cache Components är på i startern, men spinen förutsätter den gamla modellen

- **Plats:** AD-2, AD-3 (`requireUser()` i varje `data`-funktion), Consistency Conventions → "Cache och uppdatering", Structural Seed.
- **Vad som inte är kontrollerat:** Spinen och memloggen nämner aldrig `cacheComponents`. Spinen beskriver läsning i Server Components via `data`, med `requireUser()`/`getClaims()` (alltså `cookies()`), plus `revalidatePath` och "ingen klientcache". Det motsvarar cachemodellen före Next 16.
- **Bevis:**
  - Scaffoldens `next.config.ts` (create-next-app 16.4.3) innehåller `cacheComponents: true, partialPrefetching: true`.
  - `docs/01-app/02-guides/authentication-with-cache-components.md` säger: "With Cache Components, reading `cookies()` outside a boundary is a build error." Den säger också: "Keep the session read out of a layout's top level".
  - `route-segment-config/index.md` säger: "`dynamic`, `dynamicParams`, `revalidate`, and `fetchCache` removed when Cache Components is enabled". `runtime` stöds inte heller (`cacheComponents.md`).
  - `cacheComponents.md` säger att Next med Cache Components behåller sidor dolda via React `<Activity>` vid navigering. Tillstånd och effekter beter sig därför annorlunda, vilket påverkar stegläget och formulär.
  - `refresh()` från `next/cache` finns för Server Actions (`04-functions/refresh.md`). `revalidatePath` från en Server Action uppdaterar också tidigare besökta sidor (`revalidatePath.md`).
- **Åtgärd:** Lägg till ett beslut, till exempel "AD-18 – Rendering och cache", med:
  - Behåll `cacheComponents: true` som i startern. Logga beslutet i memloggen.
  - Allt som läser sessionen (`requireUser()` och `data`-anrop) renderas i en komponent inuti `<Suspense>`. En layout gör aldrig `await` på sessionen på toppnivå.
  - Ingen `'use cache'` på användardata i v1. Om det införs senare får `userId` bara skickas in som argument (eller används `'use cache: private'`).
  - Efter en skrivning anropar actionen `revalidatePath` för berörda rutter, eller `refresh()`.
  - Route segment config begränsas till `maxDuration`. Ingen `dynamic` och ingen `runtime`.
  - Stängs Cache Components av i stället ska det beslutet och skälet skrivas uttryckligen.

### V-2 · Hög · Supabase-grants: nya tabeller exponeras inte i det nya molnprojektet

- **Plats:** AD-4, AD-5, Miljöer och drift (molnprojektet `matkoll` skapas efter Epic 1–3).
- **Vad som inte är kontrollerat:** AD-4 förutsätter att RLS och en policy räcker. Ingen `GRANT` nämns.
- **Bevis:**
  - Supabases changelog 45329: "**May 30, 2026:** The opt-out becomes the default for all new projects … **October 30, 2026:** The new behavior applies to all existing projects." Utan grant svarar PostgREST med `42501`. Den rekommenderade SQL-koden har uttryckliga `grant … to authenticated/service_role` före `enable row level security`.
  - Den lokala `supabase/config.toml` från `supabase init` (CLI 2.122.0) innehåller `# auto_expose_new_tables = true` med kommentaren "Left unset, a fresh project falls back to `true`." Lokal miljö och CI exponerar alltså tabeller automatiskt, men det nya molnprojektet gör det inte.
- **Åtgärd:**
  - Sätt `[api] auto_expose_new_tables = false` i `supabase/config.toml` så att lokal miljö, CI och moln beter sig lika.
  - Komplettera AD-4: varje migration som skapar en tabell innehåller `grant select, insert, update, delete on public.<t> to authenticated;` och `… to service_role;`, men ingen grant till `anon`, eftersom webbläsaren aldrig använder Data API (AD-2). Därefter kommer `enable row level security` och policyn.
  - RLS-testerna ska godta både `42501` och tomt resultat för anonym klient.

### V-3 · Medel · AI-porten: AI SDK 7-API:t och LM Studio-adaptern är inte kontrollerade

- **Plats:** AD-9, Stack (`ai` 7.0.153, `@ai-sdk/openai-compatible` 3.0.78).
- **Vad som inte är kontrollerat:** Memloggen kontrollerade versioner och zod-peer, men inte hur strukturerade svar, bilder, omförsök och avbrott görs i v7.
- **Bevis:**
  - `ai@7.0.153` `dist/index.d.ts`: `generateObject` har `@deprecated Use \`generateText\` with an \`output\` setting instead.` Enligt `docs/03-ai-sdk-core/10-generating-structured-data.mdx` är det rätta mönstret `generateText({ output: Output.object({ schema }) })`.
  - I migreringsguiden för v7 är bilddelen `{ type: 'image', image }` utfasad. Den ersätts av `{ type: 'file', mediaType: 'image/jpeg', data }`.
  - `@ai-sdk/openai-compatible@3.0.78` `dist/index.js` rad 358 och 430–438: `supportsStructuredOutputs` är `false` som standard. Då skickas `response_format: { type: "json_object" }` utan schema, och `json_schema` skickas bara när flaggan är `true`. LM Studios dokumentation för strukturerade svar beskriver bara `json_schema` ("the JSON schema should be provided in the `json_schema` field of `response_format`"). En tredjepartsimplementation anger att LM Studio inte stöder `json_object`.
  - `25-settings.mdx`: `maxRetries` är som standard `2` för API-fel. Tillsammans med portens två nya försök vid ogiltiga svar blir det upp till 9 modellanrop inom `maxDuration = 120`.
  - `abortSignal` finns, men Next 16.4.3-dokumentationen nämner inte att `request.signal` avbryts när klienten kopplar ner. Att en avbruten fråga från klienten också stoppar arbetet i LM Studio är alltså inte kontrollerat.
- **Åtgärd:** Komplettera AD-9:
  - Portens adaptrar använder `generateText` + `Output.object({ schema })`, aldrig `generateObject`.
  - Bilder skickas som `file`-delar.
  - `lmstudio` skapas med `createOpenAICompatible({ baseURL, supportsStructuredOutputs: true, headers })`. Cloudflare Access-huvudena `CF-Access-Client-Id`/`-Secret` läggs i `headers`.
  - `maxRetries: 0` eller 1 i SDK:n, så att portens räkning gäller.
  - `abortSignal: request.signal` skickas vidare.
  - Lägg till ett röktest mot LM Studio (ett recept och en bild) i Epic 1 och logga resultatet i memloggen.

### V-4 · Medel · Inloggningslänken: rutt och Supabase-standardval stämmer inte med dagens dokumentation

- **Plats:** AD-3, Capability Map (FR-1 `app/auth/callback`).
- **Vad som inte är kontrollerat:** Spinen förutsätter `auth/callback`, alltså kodutbyte. Supabases standardval för registrering är inte kontrollerat.
- **Bevis:**
  - Supabase, "Passwordless email logins": för PKCE ska du "edit the Magic Link email template to send a token hash" med `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Routen anropar `verifyOtp` med `token_hash`.
  - Supabases SSR-guide för Next anger nyckelnamnen `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` och sessionsförnyelse i `proxy.ts` med `getClaims()`, vilket stämmer med memloggen.
  - Min slutsats (inte bekräftad i dokumentationen): kodutbyte kräver PKCE-verifieraren i samma webbläsare. Öppnas länken i mejlappens inbyggda webbläsare på telefonen kan det misslyckas. `token_hash`-flödet har inte det beroendet.
  - Lokal `config.toml` (CLI 2.122.0) har `enable_signup = true` i både `[auth]` och `[auth.email]`. Den publika nyckeln är inte hemlig. Vem som helst kan alltså anropa Supabase Auth direkt och skapa ett konto utan att passera `ALLOWED_EMAILS`. RLS isolerar fortfarande datan, men kontot skapas.
- **Åtgärd:**
  - Byt rutten till `app/auth/confirm/route.ts` med `verifyOtp({ token_hash, type: 'email' })`.
  - Lägg mejlmallen i `supabase/config.toml` (`[auth.email.template.magic_link]`) och i molnprojektet.
  - Anropa `signInWithOtp` med `shouldCreateUser: false`, stäng av registrering (`enable_signup = false`) och skapa de tillåtna användarna via ett seed- eller adminskript. Alternativet är en "before user created"-hook som kontrollerar listan.
  - Uppdatera FR-1-raden i Capability Map.

### V-5 · Medel · Vercels gräns på 4,5 MB för request body gäller fotouppladdningen

- **Plats:** AD-9, AD-15, FR-4 och FR-24 (`app/api/ai/analyze`, `app/api/ai/import`).
- **Vad som inte är kontrollerat:** Memloggen kontrollerade gränsen på 300 s men inte storleken på request body.
- **Bevis:** vercel.com/docs/functions/limitations: "The maximum payload size for the request body or the response body of a Vercel Function is **4.5 MB** … return an error 413: `FUNCTION_PAYLOAD_TOO_LARGE`." Gränsen finns inte lokalt, så felet syns först i molnet. Mobilfoton på 4–12 MB är vanliga.
- **Åtgärd:** Lägg till i AD-15:
  - Klienten skalar ner och komprimerar foton före uppladdning (till exempel längsta sida 2048 px, JPEG, under 2 MB).
  - Route Handlern kontrollerar storleken och returnerar felkoden `image_too_large` (lägg till den i `src/lib/errors.ts`).
  - E2E-testet använder ett fotografi i full storlek.

### V-6 · Medel · JSON-LD på de seedade receptsajterna räcker inte som färdigt receptformat

- **Plats:** AD-11 ("Strukturerad data (JSON-LD) används först"), AD-10, Datamodell (`recipe_site` seedas med `koket.se`, `tasteline.com`).
- **Vad som inte är kontrollerat:** Det är inte kontrollerat att sajternas JSON-LD ger mängd, enhet och namn per rad.
- **Bevis (hämtat 2026-10-25):**
  - `https://koket.se` och `https://tasteline.com` ger `301` till `www.`-varianten. Det stämmer med regeln om `www.` och förbrukar 1 av 3 omdirigeringar.
  - Båda recept­sidorna har `"@type":"Recipe"` i `application/ld+json`.
  - På koket.se är `recipeIngredient` fritext med rubriker inblandade: `"1 gul lök", …, "600 g nötfärs", "Sås", "3 msk japansk soja"`.
  - På tasteline.com saknas mängder helt: `"gul lök(ar)", "crème fraîche", "körsbärstomater", …`.
  - Sidstorleken är cirka 145–215 kB, långt under gränsen på 3 MB.
- **Åtgärd:** Skriv i AD-11 att JSON-LD är **indata** till `parseRecipe` (strukturerat och mindre brus än sidtexten), inte en färdig `RecipeDraft`. Alternativt definieras en regel för när JSON-LD är fullständig (till exempel att minst hälften av raderna har en mängd), och annars används sidtexten. Lägg till sparade HTML-sidor från båda sajterna i `tests/fixtures/`.

### V-7 · Låg · ESLint 9 och TypeScript 5 är låsta av startern, och skälet saknas

- **Plats:** Stack (ESLint 9.39.5, TypeScript 5.9.3), AD-1 (`import/no-restricted-paths`).
- **Bevis:**
  - eslint.org/version-support: "ESLint v9.x reached end-of-life on 2026-08-06". Senaste ESLint är 10.13.0.
  - `eslint-config-next@16.4.3` beror på `eslint-plugin-import ^2.32.0` (peer `… ^9`, senaste är 2.32.0), `eslint-plugin-jsx-a11y` (peer `… ^9`) och `eslint-plugin-react` (peer `… ^9.7`). ESLint 10 är alltså inte möjligt än.
  - `typescript-eslint` har peer `typescript >=4.8.4 <6.1.0`, medan senaste TypeScript är 7.0.2.
  - AD-1 fungerar: `eslint-config-next/dist/index.js` registrerar `import` som plugin med resolvern `eslint-import-resolver-typescript` för alla `**/*.{js,…,tsx}`. `import/no-restricted-paths` kan alltså användas i ett senare konfigurationsobjekt utan att pluginet registreras igen.
- **Åtgärd:** Skriv i Stack: "ESLint 9.39.5 (EOL, låst av eslint-config-next 16.4.3; uppgradera inte till 10)" och "TypeScript 5.9.3 (låst av typescript-eslint `<6.1`)". Annars kan en agent "uppgradera till senaste" och få lint och typkontroll att sluta fungera.

### V-8 · Låg · Vitest 5 behöver `vite`, `@types/node` och hantering av `server-only`

- **Plats:** Stack (vitest 5.0.5), Konventioner → Tester, AD-14 (`env.ts` märkt `server-only`).
- **Bevis:**
  - `vitest@5.0.5` har `peerDependenciesMeta.vite.optional: false`, med peer `^6.4.0 || ^7.0.0 || ^8.0.0`. Senaste `vite` är 8.3.5.
  - Peer `@types/node` är `^22.0.0 || >=24.0.0`, men scaffolden har `@types/node ^20`.
  - Next-dokumentationen säger att Next hanterar `server-only` internt. Utanför Next (i Vitest) kastar importen ett fel om inget alias finns.
- **Åtgärd:**
  - Lägg till `vite` (^8) och `@types/node` (^24) i devDependencies.
  - `vitest.config.ts` ska innehålla alias för `@/` och mocka `server-only` (alias till en tom modul).
  - Skriv in det i Structural Seed.

### V-9 · Låg · Säkerhetsgolv för Next och React är inte angivet

- **Plats:** Stack (Next 16.4.3, React 19.3.0).
- **Bevis:**
  - GitHub Advisories 2026-10-22: GHSA-673q-mjm6-r5xr (kritisk RCE i `use cache`, `>=16.0.0 <=16.4.0`), GHSA-2464-fhr4-w9xw (kritisk RCE i Image Optimization, `<=16.4.0`) och GHSA-p3m5-59mp-jv5r (DoS i Server Actions, `<=16.4.0`). 16.4.3 är inte drabbad.
  - `react` 19.3.1 släpptes 2026-10-14 ("Improve transport protocol" för RSC). Ingen advisory mot 19.3.0 hittades, men startern pinnar 19.3.0.
- **Åtgärd:**
  - Skriv golvet "next ≥ 16.4.1 (GHSA-673q, GHSA-2464)" i Stack.
  - Ta ställning till 19.3.1, eller logga varför 19.3.0 behålls.
  - Lägg till `pnpm audit --prod` eller Dependabot i CI.

### V-10 · Låg · Tailwind: starterns faktiska uppsättning nämns inte

- **Plats:** AD-17, Stack.
- **Bevis:**
  - Scaffolden använder `@tailwindcss/turbopack` (4.3.3) via `turbopack.rules` i `next.config.ts` och har ingen `postcss.config`.
  - `globals.css` använder `@theme inline` med variabler i `:root` och `@media (prefers-color-scheme: dark)`. Mönstret i AD-17 fungerar alltså. Det är verifierat.
- **Åtgärd:** Skriv `@theme inline` uttryckligen i AD-17 och lägg till `@tailwindcss/turbopack` i Stack. Ingen PostCSS-konfiguration ska läggas till.

### V-11 · Låg · Screen Wake Lock: stöd och villkor

- **Plats:** Capability Map FR-20/FR-21 ("Wake Lock i klienten").
- **Bevis:**
  - MDN: "Baseline 2025 … Since March 2025", "available only in secure contexts (HTTPS)". Låset släpps när dokumentet inte är synligt, och dokumentationen säger "re-acquire … listen for visibilitychange".
  - Enligt tredjepartskällor (Progressier, WebKit-bugg 254545) fungerade det inte i webbappar på hemskärmen på iOS förrän 18.4. Det är inte bekräftat av Apple.
- **Åtgärd:** Lägg till i FR-21-raden:
  - Begär låset i en effekt med cleanup och hämta det igen vid `visibilitychange`. Cleanup-delen är viktig med `<Activity>`, se V-1.
  - Fånga fel med `try/catch` och visa då notisen från EXPERIENCE.md.
  - Test på telefonen kräver https (Vercel-preview eller tunnel), inte http via LAN.

### V-12 · Låg · gitleaks och CI-actions saknar versioner

- **Plats:** CI-delen i Miljöer och drift, NFR-8.
- **Bevis:**
  - `gh api users/Snowstar66` ger `User`. Enligt README för gitleaks-action krävs `GITLEAKS_LICENSE` bara för organisationer, så det behövs inte nu.
  - Senaste versioner: `gitleaks/gitleaks-action` v3.0.0 (Node 24-runtime), `gitleaks` v8.30.1 och `supabase/setup-cli` v3.0.1.
  - Vercel stöder Node 24.x (standard) och 22.x samt pnpm upp till 12.
- **Åtgärd:**
  - Pinna `gitleaks/gitleaks-action@v3` och `supabase/setup-cli@v3` i spinen. Notera att en flytt till en organisation kräver licens, eller att gitleaks-CLI:t används direkt.
  - Lägg `"engines": { "node": "24.x" }` i `package.json` så att Vercel, CI och lokal miljö matchar.

### V-13 · Låg · Testmodellen Qwen3.6-35B-A3B är inte kontrollerad för bild och JSON-schema i LM Studio

- **Plats:** Stack ("Testmodell"), FR-4, FR-24.
- **Bevis:** Tredjepartslistor (Azure-katalogen, Novita, Hugging Face) anger indata som "text, image, video". Någon källa om att LM Studio laddar visionsdelen hittades inte. LM Studio varnar för att strukturerade svar beror på modellen.
- **Åtgärd:** Gör röktestet i V-3 med just den modellen innan Epic 1 räknas som klar, och logga resultatet i memloggen.

### V-14 · Låg · Kommandot för typgenerering och namnen på miljövariabler är oprecisa

- **Plats:** AD-5, AD-14.
- **Bevis:**
  - Supabase CLI 2.122.0, `supabase gen types --help`: språket är valfritt (standard är typescript) och källan väljs med `--local`/`--linked`/`--project-id`. `-o/--output` styr formatet på statusvariabler, inte en filsökväg.
  - Kommandona `supabase migration new` och `supabase db push` finns.
- **Åtgärd:**
  - Skriv kommandot exakt i AD-5: `supabase gen types --local --schema public > src/lib/supabase/database.types.ts`.
  - Skriv variabelnamnen i AD-14: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Eftersom webbläsaren aldrig använder Supabase (AD-2) kan prefixet `NEXT_PUBLIC_` också tas bort helt.

---

## Kontrollerat och i ordning

| Påstående | Bevis |
| --- | --- |
| Alla versioner i Stack är aktuella | `npm view` 2026-10-25: next 16.4.3, tailwindcss 4.3.3, eslint-config-next 16.4.3, pnpm 12.15.0, supabase-js 2.118.0, ssr 0.12.7, supabase 2.122.0, ai 7.0.153, openai-compatible 3.0.78, anthropic 4.0.88, openai 4.0.102, zod 4.6.7, cheerio 1.2.0, vitest 5.0.5, @playwright/test 1.64.1. Undantag: react (V-9) och de avsiktligt låsta eslint och typescript (V-7). |
| `export const maxDuration = 120` i `route.ts` | `route-segment-config/maxDuration.md` och `index.md` (Next 16.4.3). Inte borttaget med Cache Components, till skillnad från `dynamic`, `revalidate`, `fetchCache` och `runtime`. |
| Vercel Hobby har 300 s som tak | vercel.com/docs/functions/limitations (uppdaterad 2026-08-24). |
| `server-only` | Next-dokumentationen `05-server-and-client-components.md` rekommenderar `pnpm add server-only`. Next hanterar paketet internt och har egna typer. |
| `proxy.ts` körs i Node.js | `file-conventions/proxy.md`: "Proxy defaults to using the Node.js runtime"; `runtime` kastar fel. |
| Zod 4 med AI SDK 7 | Peer `zod ^3.25.76 \|\| ^4.1.8` i `ai` och alla `@ai-sdk/*`. Node ≥22 krävs, lokal version är 24. |
| `import/no-restricted-paths` med flat config | Pluginet registreras i eslint-config-next, se V-7. |
| Tailwind v4 `@theme` och mörkt läge via `prefers-color-scheme` | Scaffoldens `globals.css`, se V-10. |
| RLS-mönstret `(select auth.uid())` | Stämmer med Supabase. Grants saknas dock, se V-2. |
| cheerio 1.2.0 | Släppt 2026-01-23, engines node ≥20.18.1. JSON-LD hittades på båda sajterna (V-6). |
| Playwright 1.64.1 | Uppfyller Nexts peer `@playwright/test ^1.51.1`. |
| Säkerhetsrådgivningar | Inga advisories mot @supabase/ssr, @supabase/supabase-js eller cheerio. För `ai` finns bara en gammal med låg allvarlighet (`<5.0.52`). |

## Utanför denna lins (noterat i förbigående)

- Enhetslistan i AD-12 saknar `nypa`, som finns med i memloggens beslut om enheter.
