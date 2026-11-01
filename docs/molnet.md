# Livskoll i molnet – guide för flytten (Story 17.3)

Det här är den korta, praktiska vägen: ungefär 15 minuter av dina egna klick, resten gör Claude medan du tittar. Förberedelserna är klara och provade (se [Vad som är provat](#vad-som-är-provat)). Ingenting i molnet är skapat än. Flytten startar först när du säger **"nu går vi till Vercel"**.

Detaljerna bakom varje steg (gränser för inloggning, återställning av säkerhetskopian, foton, Siri) finns i [`docs/drift.md`](drift.md). Den här filen är den som följs uppifrån och ner; den pekar dit när något behöver fördjupas. Om de två säger olika saker gäller den här.

**Beslut som styr guiden:** Supabase i EU (Stockholm), Vercel Hobby med funktioner i Stockholm (`arn1`), AI via Claude (Haiku 5.5, nyckel i Vercel) i stället för LM Studio på din Mac, ett konto per hushåll med inloggning med lösenord (Story 17.2), registrering avstängd.

## Vem gör vad

| Märke | Betydelse |
| --- | --- |
| **[Pontus]** | Bara du kan göra det: konton, betalkort, villkor, att klistra in hemligheter. Claude kan och får inte. |
| **[Claude]** | Claude gör det medan du tittar (terminal, Git, kod, tester). Du behöver inte kunna något av det. |
| **[Båda]** | Du klickar på en knapp eller kopierar ett värde, Claude säger vad och kontrollerar resultatet. |

Hemligheter (lösenord, nycklar) skriver du själv in i Vercels och GitHubs webbsidor eller i din terminal. Claude ser dem aldrig och läser aldrig `.env.local`.

## Översikt: ordningen

| # | Steg | Vem | Tid |
| --- | --- | --- | --- |
| 0 | Konton och betalning (Supabase, Vercel, Anthropic, ev. e-posttjänst) | Pontus | 5 min |
| 1 | Supabase-projektet i EU | Båda | 3 min |
| 2 | Inloggning och e-post i Supabase | Båda | 4 min |
| 3 | Första migreringen (schemat) | Claude | 2 min |
| 4 | Vercel-projektet och miljövariablerna | Båda | 5 min |
| 5 | Din användare | Båda | 1 min |
| 6 | Första publiceringen | Claude | 3 min |
| 7 | Rökprov | Båda | 5 min |
| 8 | Slå på CI och säkerhetskopian | Båda | 3 min |
| 9 | Egen domän (valfritt) | Båda | 5 min |
| 10 | Flytta din data (recept, lager, matsedlar, listor, foton) | Båda | 5 min |

Stegen 0, 1, 2 och 4 är det som tar din tid. Gör inte steg 6 förrän 1–5 är klara.

## Före flytten: det som måste vara klart

Läs [Kvar innan flytten](#kvar-innan-flytten) längst ned. Punkterna märkta **Före flytten** får inte hoppas över; de flesta är en rad i den här guiden.

## 0. Konton och betalning – [Pontus]

1. **Supabase** (supabase.com): skapa konto med den e-postadress du vill logga in med i Livskoll. Den adressen är också den enda Supabase skickar mejl till innan egen e-posttjänst finns (steg 2).
2. **Vercel** (vercel.com): skapa konto med **Continue with GitHub**, plan **Hobby**. Hobby är gratis men för personligt, icke-kommersiellt bruk. Ett hushåll och några vänner passar; ska appen bli en tjänst åt andra behövs Pro.
3. **Anthropic** (console.anthropic.com): skapa konto, lägg in betalkort, skapa en API-nyckel (**API Keys → Create Key**, namn `livskoll`) och spara den i din lösenordshanterare. Sätt **Limits → Monthly spend limit** (till exempel 100 kr) så att kostnaden aldrig kan skena. Kostnaden syns också i appen under Inställningar → AI.
4. **E-posttjänst för inloggningsmejl** (krävs före vänner, valfritt för bara dig): Resend (resend.com) eller Postmark. Skapa konto, verifiera en avsändardomän, skapa en SMTP-/API-nyckel. Har du ingen egen domän går det inte; vänta då med vänner.
5. **GitHub**: du har redan repot. Du behöver vara ägare för att lägga in hemligheter.

Säg till Claude när 1–3 är klara. Skicka inga nycklar i chatten.

## 1. Supabase-projektet i EU – [Båda]

**New project** i Supabase:

| Inställning | Värde |
| --- | --- |
| Name | `livskoll` |
| Database password | **Generate**, spara i lösenordshanteraren (behövs i steg 3 och 8) |
| Region | **North EU (Stockholm), eu-north-1** (nära Vercels `arn1`). Går inte Stockholm: Frankfurt eller Irland, och byt Vercels region i steg 4 till `fra1` eller `dub1`. |
| Security: Enable Data API | på |
| Security: automatically expose new tables | **av** om rutan finns (migrationerna ger varje tabell sina egna rättigheter) |
| Postgres-version | 17 (standard för nya projekt). Migrationerna kräver 17: de använder kollationen `pg_c_utf8`. |

Efteråt, kopiera till din lösenordshanterare och berätta bara **projekt-id:t** (`<ref>`, i adressen `https://<ref>.supabase.co`) för Claude:

- Project Settings → **General**: Project ID, region (ska stå `eu-north-1`).
- Project Settings → **Data API**: Project URL.
- Project Settings → **API Keys**: **Publishable key** (`sb_publishable_…`) och **Secret key** (`sb_secret_…`).
- **Connect** → **Session pooler**-strängen (för säkerhetskopian, steg 8).

**Inget att slå på för tillägg, lagring eller radskydd:**

- **Tillägg (extensions):** `pg_trgm` skapas av migrationen (`create extension if not exists pg_trgm with schema extensions`); `pgcrypto` och `uuid-ossp` finns redan i varje projekt. Inget i **Database → Extensions** behöver slås på.
- **Radskydd (RLS):** ligger i migrationerna. Alla 29 tabeller i `public` har radskydd på; ingen tabell är öppen för `anon`. Det provades på en tom databas (se nedan).
- **Lagringsbuckets (Storage):** `pantry-photo` och `thing-photo` (båda privata, JPEG/PNG, 1,5 MB, en mapp per användare) och deras policyer skapas av `supabase db push` i steg 3. Skapa inga buckets i panelen.
- **Realtid:** tabellerna för den delade inköpslistan läggs i publikationen `supabase_realtime` av migrationen `20261031190000_realtime_shopping_list.sql`. Kontrollera under **Database → Publications → supabase_realtime** efter steg 3 att `shopping_check`, `shopping_custom_item`, `shopping_line_override`, `meal_plan`, `meal_plan_recipe`, `pantry_item` och `product_choice` finns.

## 2. Inloggning och e-post i Supabase – [Båda]

Alla värden nedan motsvarar `supabase/config.toml`, som är facit för det lokala.

**Authentication → Sign In / Providers:**

- **Allow new users to sign up: av.** Ingen kan skapa sig själv ett konto; användare skapas bara av `pnpm users:sync` (steg 5). Det här är hela "bara inbjudna".
- **Email**-leverantören: på. **Confirm email**: av (adresserna bekräftas av `users:sync`).
- **Minimum password length:** 12 (appen kräver 12 själv, men panelen ska säga detsamma).
- **Email OTP Length:** 6. **Email OTP Expiration:** 3600.
- Övriga leverantörer (Google m.fl.), anonyma inloggningar och MFA: av.

**Authentication → URL Configuration** (använd adressen du får i steg 4; börja med `https://livskoll.vercel.app` om den är ledig, annars den du fick, och byt här om du senare köper egen domän):

- **Site URL:** `<adress>`
- **Redirect URLs:** `<adress>/auth/confirm**` (de två stjärnorna behövs för `?next=`).

**Authentication → Emails → Templates:**

| Mall | Subject | Body |
| --- | --- | --- |
| Magic Link | `Din inloggningslänk till Livskoll` | hela innehållet i `supabase/templates/magic-link.html` |
| Reset Password | `Välj lösenord i Livskoll` | hela innehållet i `supabase/templates/recovery.html` |

Claude öppnar filerna och du klistrar in. Kontrollera att knappens länk i mallarna är kvar oförändrad (`{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=…`) och att magic-link-mallen har `{{ .Token }}` (sexsiffrig kod). De övriga mallarna (Confirm signup, Invite, Change email) används inte och kan stå kvar.

**E-postutskick (SMTP):**

- **Bara du loggar in:** Supabase inbyggda utskick räcker. Det skickar bara till dig som teammedlem (samma adress som ditt Supabase-konto) och bara några mejl i timmen. Din adress i `ALLOWED_EMAILS` måste därför vara samma som Supabase-kontots.
- **Fler än du, eller vänner:** **Authentication → Emails → SMTP Settings → Enable Custom SMTP.** Fyll i värdena från e-posttjänsten (Resend: host `smtp.resend.com`, port `465`, användare `resend`, lösenord = API-nyckeln), **Sender email** `inlogg@<din domän>`, **Sender name** `Livskoll`. Skicka sedan ett provmejl. Efter det: **Authentication → Rate Limits → Emails per hour** till till exempel 30.

## 3. Första migreringen – [Claude]

Alla 86 migrationer är provade på en helt tom databas (se [Vad som är provat](#vad-som-är-provat)). Första gången körs de från Claudes terminal så att du ser resultatet:

```bash
pnpm exec supabase login                      # öppnar webbläsaren, du klickar Tillåt   [Pontus klickar]
pnpm exec supabase link --project-ref <ref>   # frågar efter databaslösenordet            [Pontus skriver det]
pnpm exec supabase db push --dry-run          # visar vad som kommer köras
pnpm exec supabase db push                    # kör alla migrationer
pnpm exec supabase migration list             # Local och Remote ska visa samma versioner
```

Kör aldrig `supabase db reset` mot molnet. Efter det här första steget sköts nya migrationer av CI (steg 8).

Kontroll: **Table Editor** visar tabellerna i `public`, **Storage** visar buckets `pantry-photo` och `thing-photo`, och realtids-publikationen har de sju tabellerna.

## 4. Vercel-projektet och miljövariablerna – [Båda]

**Add New → Project → Import** `matkoll`-repot från GitHub.

| Inställning | Värde |
| --- | --- |
| Project name | `livskoll` |
| Framework Preset | Next.js (känns igen) |
| Root Directory | `./` (repots rot) |
| Build Command | standard (`next build`, via `pnpm build`) |
| Install Command | standard (pnpm känns igen på `pnpm-lock.yaml`) |
| Output Directory | standard |
| Node.js Version | **24.x** (Settings → General; matchar `engines` i `package.json`) |
| Function Region | **Stockholm, `arn1`** (står redan i `vercel.json`; ska stå samma i Settings → Functions). Hamnade databasen i Frankfurt: `fra1`, i Irland: `dub1`. |
| Fluid Compute | **på** (standard för nya projekt; Settings → Functions). Utan det stoppar Hobby funktioner efter 60 s, och AI-importerna har 300 s. |
| Production Branch | `main` (Settings → Git) |
| Deployment Protection | **Vercel Authentication ska inte gälla Production** (Settings → Deployment Protection). Annars får Siri-genvägen och inloggningslänkarna en Vercel-inloggningssida i stället för appen. |

Första importen försöker bygga direkt. Repots `vercel.json` har `"ignoreCommand": "exit 0"`, som får Vercel att hoppa över bygget tills molnet är uppsatt, så det blir inget misslyckat bygge. Den raden tar Claude bort i steg 6.

Sätt miljövariablerna under **Settings → Environment Variables** *innan* steg 6. Allt som står är provat mot `src/server/env.ts`; appen startar inte om något saknas eller inte passar ihop.

### Miljövariabler i Vercel

| Variabel | Värde och var det hämtas | Production | Preview | Hemlig? |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co`: Supabase → Project Settings → Data API | ja | nej | offentlig |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`: Supabase → Project Settings → API Keys | ja | nej | offentlig (skyddas av radskydd) |
| `SITE_URL` | den **enda** adressen folk öppnar, med `https://` och utan avslutande snedstreck: `https://livskoll.vercel.app` eller egen domän. Samma värde som Site URL i steg 2. | ja | ja (samma) | offentlig |
| `ALLOWED_EMAILS` | din inloggningsadress (fler: kommaseparerat). Måste vara samma adresser som `pnpm users:sync` skapar. | ja | nej | privat (e-postadresser) |
| `AI_PROVIDER` | `anthropic` | ja | `mock` | offentlig |
| `AI_MODEL` | `claude-haiku-5-5` (krävs för `anthropic`) | ja | nej | offentlig |
| `ANTHROPIC_API_KEY` | `sk-ant-…` från steg 0 | ja | nej | **hemlig: markera Sensitive** |
| `AI_SETTINGS_EMAILS` | din adress: bara den ser AI-avsnittet i Inställningar | ja | nej | privat |
| `OWNER_EMAIL` | din adress: appens ägare (Story 20.3). Bladen under Hjälp → Tyck till skriver "Pontus ser texten …" med förnamnet härifrån. Vem som ser **Inkorg** avgörs inte av variabeln utan av databasen; `pnpm owner:sync` i steg 5 skriver adressen dit. | ja | nej | privat |
| `LMSTUDIO_BASE_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | **sätts inte** när molnet kör Claude. Behövs bara om du vill att Qwen på Macen ska kunna väljas, via Cloudflare Tunnel ([`drift.md` steg 8](drift.md#8-cloudflare-tunnel-och-access-för-lm-studio)). | nej | nej | CF-hemligheten är hemlig |
| `OPENAI_API_KEY` | används inte | nej | nej | hemlig |
| `AI_MOCK_DELAY_MS` | **sätts aldrig** (bara testerna) | nej | nej | – |
| `DEV_AUTO_LOGIN_EMAIL`, `DEV_AUTO_LOGIN_PASSWORD`, `MATKOLL_DEV_LOOPBACK` | **sätts aldrig** (automatisk inloggning på din dator) | nej | nej | – |
| `SUPABASE_SERVICE_ROLE_KEY` | **läggs aldrig i Vercel**, bara tillfälligt i din terminal i steg 5 | nej | nej | hemlig |
| `VERCEL`, `NODE_ENV` | sätts av Vercel och Next själva | auto | auto | – |

Preview får bara `SITE_URL` och `AI_PROVIDER=mock`. Förhandsversioner når därför aldrig den riktiga databasen; de bygger bara och svarar 503 (provat). Variabler börjar gälla först i nästa driftsättning.

### Hemligheter och variabler i GitHub (steg 8)

**GitHub → repot → Settings → Secrets and variables → Actions:**

| Namn | Typ | Värde och var det hämtas | Används av |
| --- | --- | --- | --- |
| `CLOUD_ENABLED` | Variable | `true` när allt fungerar (strömbrytaren) | båda flödena |
| `SUPABASE_ACCESS_TOKEN` | Secret | supabase.com → Account → **Access Tokens** → Generate (namn `github-ci`) | `cloud-migrate.yml` |
| `SUPABASE_DB_PASSWORD` | Secret | databaslösenordet från steg 1 | `cloud-migrate.yml` |
| `SUPABASE_PROJECT_REF` | Secret | `<ref>` från steg 1 | `cloud-migrate.yml` |
| `SUPABASE_DB_URL` | Secret | Session pooler-strängen med lösenordet i (procentkodat, `@` blir `%40`) | `backup.yml` |
| `BACKUP_PASSPHRASE` | Secret | minst 32 tecken: `openssl rand -base64 32`; spara i lösenordshanteraren, utan den går kopiorna inte att läsa | `backup.yml` |

## 5. Din användare – [Båda]

Claude kör i din terminal, du klistrar in den hemliga nyckeln när den frågar (den syns inte och hamnar inte i historiken):

```bash
read -rs SUPABASE_SERVICE_ROLE_KEY            # klistra in sb_secret_… från steg 1
export SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co ALLOWED_EMAILS=<din adress> pnpm users:sync
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co OWNER_EMAIL=<din adress> pnpm owner:sync
unset SUPABASE_SERVICE_ROLE_KEY
```

Kontroll: **Authentication → Users** visar din adress, och `owner:sync` skriver `owner <din adress>`.

**Ägaren och Inkorgen (Story 20.3).** Det som skickas från Hjälp → Tyck till (förslag, betyg, fel) sparas i tabellen `feedback`. Alla inloggade får lägga till sina egna rader, men bara ägaren får läsa dem och markera dem lästa, inte ens avsändaren ser sina egna. Databasen kan inte läsa Vercels miljövariabler, så ägaren står i en egen tabell, `app_owner`, som ingen klient kan läsa eller ändra (bara service role). Där står ägarens **användar-id**, inte adressen: e-postbekräftelsen är av, så en inloggad kan byta sin adress direkt, och en adress som ägaren lämnat skulle annars kunna tas över. Funktionen `is_app_owner()` svarar ja bara för den inloggade vars id står i tabellen; radskyddet på `feedback` och gruppen **Ägare** i Inställningar frågar båda den. `pnpm owner:sync` slår upp `OWNER_EMAIL` bland användarna och gör den användarens id till det enda i `app_owner`; det vägrar om ingen användare har adressen än (kör `users:sync` först). Tas ägarens konto bort försvinner ägarskapet med det. Kör `owner:sync` igen om du byter ägare eller om ditt konto görs om (nytt id); att bara byta adress på kontot behåller ägarskapet. Samma värde ska stå som `OWNER_EMAIL` i Vercel (bara för namnet i bladen). Appen använder aldrig service role för det här. På din egen dator räcker `pnpm owner:sync`: utan `OWNER_EMAIL` blir den lokala inloggningsanvändaren (`DEV_AUTO_LOGIN_EMAIL`) ägare, bara mot lokal Supabase (se README).

Efter första inloggningen väljer du lösenord: på inloggningssidan **Första gången eller glömt lösenordet? Välj lösenord**, mejlet kommer, länken öppnar en sida där du väljer lösenord (minst 12 tecken).

## 6. Första publiceringen – [Claude]

Claude gör en PR till `main` som tar bort `"ignoreCommand": "exit 0"` ur `vercel.json`, du godkänner och slår ihop den. Vercel bygger då `main` och driftsätter. (Första publiceringen i produktion kräver ditt godkännande, AD-23; din sammanslagning är godkännandet.) Gick bygget före variablerna: Vercel → **Deployments → … → Redeploy**.

Lägger Vercel en adress som inte är den du valde som `SITE_URL`: ändra `SITE_URL` i Vercel **och** Site URL och Redirect URL i Supabase till den riktiga adressen och driftsätt om. De tre måste vara identiska, annars fungerar inte inloggningsmejlen och uppladdningar nekas (403).

Står bygget fast på installationen med ett fel om `pnpm`-versionen: lägg `ENABLE_EXPERIMENTAL_COREPACK=1` som miljövariabel (alla miljöer), så använder Vercel versionen i `packageManager`.

## 7. Rökprov – [Båda]

Gör dem på telefonen (Safari/Chrome) och i datorns webbläsare, på den riktiga adressen. Claude bockar av och läser loggarna (Vercel → Logs) vid fel.

- [ ] `<adress>` leder till inloggningssidan, utan certifikatfel.
- [ ] **Inloggning:** ange din adress, få mejl (ämne och text från mallen), välj lösenord eller skriv in sexsiffrig kod, du kommer till Recept. Logga ut och in igen med lösenordet.
- [ ] En adress som inte står i `ALLOWED_EMAILS` får samma svar men inget mejl, och ingen ny användare syns under Authentication → Users.
- [ ] **Recept:** importera ett recept från en receptsajt (AI-anrop till Claude, tar några sekunder); receptet och bilden syns.
- [ ] **Matsedel:** lägg receptet på en dag.
- [ ] **Inköpslista:** raden syns; kryssa i en vara, lägg till en egen vara. Öppna samma lista på en andra enhet och se att ändringen kommer dit inom ett par sekunder (realtid).
- [ ] **Förråd (foton):** ta ett foto av en låda; fotot sparas, AI läser det och föreslår prylar. Kontrollera att filen syns i Supabase → Storage → `thing-photo` under din användares mapp.
- [ ] **Hemma/lager:** lägg till en vara, ändra mängd.
- [ ] **AI-kostnad:** Inställningar → AI visar vilken modell som används och användningen räknas upp.
- [ ] **Siri/snabbtillägg:** Inställningar → Siri och genvägar → skapa nyckel, kör sedan på datorn:
  `curl -i -X POST <adress>/api/snabb -H "Authorization: Bearer <nyckel>" -H "Content-Type: application/json" -d '{"text":"mjölk och ägg"}'`
  Svaret ska vara `200` med en kort text, och varorna syns i listan. Utan nyckel eller med fel nyckel: `401`. Provar du genvägen på iPhone ska den ge samma svar.
- [ ] **Installera appen:** lägg på hemskärmen på telefonen, öppna den därifrån, logga in med koden (inloggningen delas inte med Safari).
- [ ] **Ingen automatisk inloggning:** öppna adressen i ett privat fönster: inloggningssidan visas, aldrig appen.
- [ ] Vercel → **Logs** har inga röda fel efter provet.

Hittas fel: skriv ned vilket steg och vad som hände; Claude felsöker. Appen kan alltid stängas av genom att pausa Vercel-projektet; datan ligger kvar i Supabase.

## 8. Slå på CI och säkerhetskopian – [Båda]

Två flöden i `.github/workflows/` är färdiga men avstängda. Båda är **inte** obligatoriska kontroller på `main`; utan `CLOUD_ENABLED` hoppas de över (GitHub visar "skipped") och inget annat flöde påverkas.

- **`cloud-migrate.yml`** kör `supabase db push` mot molndatabasen vid varje push till `main` som ändrar `supabase/migrations/`. Vercels egen Git-koppling bygger och driftsätter appen vid samma push; CI anropar inte Vercel. Migrationerna är bakåtkompatibla med föregående kod, så minuterna emellan är säkra.
- **`backup.yml`** gör en krypterad `pg_dump`-kopia (via `supabase db dump`) måndag och torsdag 03:17 UTC och sparar den som artefakt i 90 dagar utanför Supabase, i GitHub. Den håller också gratisprojektet vaket (Supabase pausar gratisprojekt efter en vecka utan aktivitet).

Gör så här:

1. **[Pontus]** Lägg in hemligheterna ur tabellen ovan (alla utom `CLOUD_ENABLED`).
2. **[Pontus]** Sätt variabeln `CLOUD_ENABLED` = `true`.
3. **[Claude]** Kör **Actions → Cloud migrate → Run workflow** och **Actions → Backup → Run workflow** på `main`. Båda ska bli gröna; Backup ska ha artefakten `matkoll-backup-<datum>` med fyra `.gpg`-filer.
4. **[Pontus]** Kontrollera under **GitHub → Settings → Notifications → Actions** att misslyckade flöden mejlas till dig.
5. **[Pontus]** En gång i månaden: ladda ned senaste säkerhetskopian (zip) och spara den utanför GitHub, med lösenfrasen på ett annat ställe.

Är `CLOUD_ENABLED` på men en hemlighet saknas blir körningen röd med ett tydligt meddelande, aldrig tyst.

### Återställning

Återställ alltid till ett **nytt** Supabase-projekt (gör steg 1–3 för det först). Hela receptet, med dekryptering, vald migrationsversion och radantal, står i [`drift.md`, Återställning](drift.md#återställning). Kort: dekryptera `.gpg`-filerna med `gpg`, kör `supabase db push` (schemat byggs av migrationerna, inte av `schema.sql`), läs in `data.sql` med `psql --single-transaction` och `session_replication_role = replica`, jämför mot `counts.txt`, peka om `NEXT_PUBLIC_SUPABASE_URL` och nyckeln i Vercel och `SUPABASE_DB_URL` i GitHub.

**Observera:** kopian innehåller inga foton (filerna ligger i Storage, inte i databasen). Se punkten om foton under Kvar innan flytten.

## 9. Egen domän (valfritt) – [Pontus]

1. Vercel → projektet → **Settings → Domains → Add** `livskoll.<din domän>`. Vercel visar en DNS-post (CNAME eller A). Lägg in den hos domänens leverantör. Certifikat fixas av Vercel inom några minuter.
2. Byt **på en gång**: `SITE_URL` i Vercel (Production och Preview), **Site URL** och **Redirect URLs** i Supabase, och driftsätt om. Gamla `*.vercel.app`-adressen fungerar fortfarande för sidor men inloggningsmejl och uppladdningar går bara via `SITE_URL`.
3. Sätt domänen som **primär** i Vercel och lägg en omdirigering från `*.vercel.app` till den, så att ingen hamnar på fel adress.
4. Siri-genvägen och hemskärmsikonen pekar på gamla adressen: skapa dem på nytt (nyckeln kan behållas).
5. Använder du egen SMTP: avsändardomänen behöver inte vara samma som appens, men SPF/DKIM ska vara verifierade hos e-posttjänsten.

## 10. Flytta din data – [Båda]

Skriptet `pnpm move:cloud` (Story 17.4) kopierar **allt som är ditt** från datorns Supabase till molnkontot: alla 28 tabeller med en användare (recept, ingredienser, lager, hem och platser, matsedlar, inköpslistor, butiker och erbjudanden, Förrådets rum, kort och föremål, AI-inställningar och -användning, snabbtilläggsnycklar, det du skickat under Tyck till, att välkomstturen är sedd) och **alla fotofiler** (`pantry-photo` och `thing-photo`). Raderna får molnkontots `user_id`; alla id:n behålls, så kopplingarna mellan raderna håller och skriptet kan köras flera gånger utan dubbletter. Skriptet **ändrar aldrig** datorns databas, det bara läser den. Vem som äger appen (`app_owner`) kopieras inte, eftersom molnkontot har ett annat användar-id: kör `pnpm owner:sync` mot molnet efteråt (steg 5) om du inte redan gjort det.

Provat 2026-11-01 mellan två helt skilda lokala Supabase-stackar med påhittad data (`scripts/test-move-to-cloud.sh`), aldrig mot något molnkonto.

### När

Efter steg 7 (rökprovet), medan den lokala miljön fortfarande finns kvar. **Logga inte in och lägg in egen data i molnappen före flytten** (rökprovet går bra, men lägg inte in recept eller lager): skriptet vägrar köra om molnkontot redan har annan data än din (se nedan).

### Vad du skriver [Pontus]

1. Se till att datorns Supabase är igång (`pnpm db:start`) och att molnkontot finns (steg 5). Skriv ner din e-post i datorn och molnkontots e-post.
2. Skriv in nycklarna i **din egen terminal**, aldrig i chatten. De frågas efter utan att synas på skärmen och sparas inte i någon fil:

```bash
cd "/Users/pontus/AI Projects/Matkoll"
read -rs MOVE_TARGET_SERVICE_KEY            # klistra in sb_secret_… för molnprojektet (Supabase → Settings → API Keys)
export MOVE_TARGET_SERVICE_KEY
export MOVE_TARGET_URL=https://<ref>.supabase.co
export MOVE_SOURCE_EMAIL=<din e-post i datorns Livskoll>
export MOVE_TARGET_USER=<molnkontots e-post, eller dess id under Authentication → Users>
pnpm move:cloud --dry-run                   # provkörning: skriver bara ut vad som skulle kopieras
```

Datorns URL och nyckel hämtar skriptet själv ur den lokala Supabase (`supabase status`). Vill du ange dem själv: `MOVE_SOURCE_URL` och `MOVE_SOURCE_SERVICE_KEY` (samma sätt som ovan).

3. Läs tabellen (se [Så kontrollerar du antalen](#så-kontrollerar-du-antalen)). Ser den rätt ut, kör på riktigt:

```bash
pnpm move:cloud
unset MOVE_TARGET_SERVICE_KEY
```

### Vad Claude gör

Claude kan köra samma kommandon i din terminal medan du tittar, men **nyckeln skriver du själv** (`read -rs` ovan). Claude: kör `--dry-run` och läser tabellen med dig, kör flytten, kör den en andra gång för att visa att antalen är oförändrade, och öppnar sedan molnappen och bockar av [kontrollen](#så-kontrollerar-du-antalen) nedan. Claude läser aldrig `.env.local` och skriver aldrig ut nycklar.

### Så kontrollerar du antalen

Skriptet skriver två tabeller, före och efter, för både datorn (källan) och molnet (målet):

- **Rader per tabell:** `källa före`, `källa efter` (ska vara lika: datorn rörs inte), `mål före`, `mål efter` och `ska bli`. Efter en lyckad flytt är `mål efter` lika med `ska bli`, och för en ny molnanvändare lika med `källa före`. Enda avvikelsen som visas öppet är raden för **AI-jobb**: ett jobb som stod som pågående när du flyttade kopieras inte (det kan aldrig bli klart i molnet och skulle blockera nästa jobb).
- **Filer per bucket:** antal filer under din användare i `pantry-photo` och `thing-photo`. `mål efter` ska vara minst lika med `källa`.
- Sista raden är **"Klart. Alla antal stämmer."**; annars står det **STÄMMER INTE** vid raden och skriptet avslutas med fel.

Därefter, i molnappen: öppna Recept, Matsedel, Inköpslista, Hemma/lager och Förråd; kontrollera att ett par kända recept, lagervaror och Förrådskort syns **med sina foton**. Stäm av antalet recept mot det du hade.

Kör `pnpm move:cloud` en gång till: alla `mål efter` är oförändrade och filraderna säger `0 kopierade`.

### Säkerhetsspärrar

- Skriptet vägrar om källa och mål är **samma server** (samma adress och port, `localhost` räknas som `127.0.0.1`).
- Skriptet vägrar om molnanvändaren **redan har andra rader eller filer** än de som kopieras (avsnittet "När" ovan). `--force` går vidare ändå och lägger till; men rader som krockar med molnanvändarens egna (samma ingrediensnamn, samma lagerplats, och så vidare) stoppas av databasen och flytten avbryts med ett fel. Tomma kontot först är alltid enklast.
- Skriptet skriver aldrig över en rad vars id redan tillhör **en annan användare** i molnet.
- Skriptet kontrollerar att tabellerna i datorns och molnets databas är exakt de som skriptet känner till (`scripts/move-to-cloud/plan.ts`). Har en ny tabell lagts till stannar det med ett meddelande i stället för att tyst lämna den kvar.
- `--dry-run` ändrar ingenting, varken rader eller filer, men läser båda sidor.
- Nycklar läses bara från miljövariabler eller dolt från en fråga, och skrivs aldrig ut.

### Snabbtilläggsnycklar (Siri)

Nycklarna sparas bara som hash (sha256). Skriptet **kopierar hasharna**, så samma nyckel fungerar mot molnet: den som redan sitter i en iPhone-genväg behöver bara få **ny adress** (steg 9, punkt 4). Vill du hellre ha en ny nyckel: kör med `--skip-api-keys`, skapa sedan en ny under Inställningar → Siri och genvägar i molnappen och uppdatera genvägen. Är genvägens nyckel förlorad eller misstänkt läckt: välj det senare och återkalla den gamla.

### Detaljer

- Foton: filerna kopieras byte för byte till samma sökväg men med molnanvändarens id som första mapp; kolumnerna `object_path` skrivs om på samma sätt. Filer som redan finns (samma storlek) hoppas över vid en omkörning.
- Kopplingar mellan rader av samma tabell (Förrådets "samma som" och "ersätter foto") skrivs i ett andra varv, så ordningen aldrig spelar roll.
- Genererade kolumner (`store_offer.label_key`) räknas ut av molnet.
- Inte med: inloggningsuppgifter (molnkontot är redan skapat i steg 5), mejlhistorik, Realtime-tillstånd och Storage-filer som inte ligger under din användares mapp.
- Mängder (`numeric`) går som JSON-tal och klarar de värden appen sparar (gram, deciliter och så vidare).
- Efter flytten: stäng inte av den lokala miljön förrän du kontrollerat antalen och sett fotona i molnappen, och tills backupen (steg 8) också tar `thing-photo`.

## Vad som är provat

Provat 2026-10-31 i förberedelsegrenen `prep/molnet`, utan någon molnkontakt:

- **Alla 86 migrationer på en tom databas.** En helt ny, separat Supabase-stack (eget projekt-id och egna portar, bort efteråt) startades utan seed och med bara migrationerna. Alla 86 kördes utan fel, i ordning. Därefter: 26 tabeller i `public`, alla med radskydd; buckets `pantry-photo` och `thing-photo`; publikationen `supabase_realtime` med de sju tabellerna; `supabase db push --dry-run` mot samma databas svarade "up to date". Stacken stoppades och dess containrar och volymer togs bort; din vanliga lokala databas rördes inte.
- **Beroenden på lokala saker:** inga hittades. Ingen `seed.sql` finns (och `config.toml` pekar på en som inte finns, vilket är harmlöst). Migrationerna skapar inga roller; de använder `anon`, `authenticated` och `service_role`, som finns i molnet. De skriver till `storage.buckets` och `storage.objects` (bucketar och policyer): det kräver att Storage-tjänsten finns, vilket den gör i varje hostat projekt. De skapar tillägget `pg_trgm` i schemat `extensions` (finns i molnet) och lägger tabeller i `supabase_realtime` (finns i molnet). `pg_c_utf8` kräver Postgres 17.
- **Bygge i molnläge:** `SITE_URL=https://… AI_PROVIDER=anthropic AI_MODEL=claude-haiku-5-5 ANTHROPIC_API_KEY=… VERCEL=1 pnpm build` bygger utan fel och utan `.env.local`.
- **Automatisk inloggning:** kan inte slå till i molnet (se nedan).

Inte provat, eftersom det kräver molnet: e-postutskick, realtid mot hostad Supabase, Storage mot hostad Supabase, Vercels funktionstider, att Vercel hittar pnpm-versionen.

## Kvar innan flytten

Granskning av koden inför molnet. Rangordnad: **Före flytten** (måste vara klart), **Före vänner** (måste vara klart innan någon annan än hushållet bjuds in) och **Efter flytten** (bra att fixa, hindrar inget).

### Före flytten

1. **`SITE_URL` måste vara exakt den adress folk använder.** AI-, foto- och realtidsrutterna nekar (403) en förfrågan vars `Origin` inte är `SITE_URL`:s origin (`isCrossSite` i `src/app/api/ai/route-support.ts`), och mejlens länkar byggs från den. Öppnar du appen på `*.vercel.app` medan `SITE_URL` är en egen domän, eller `www` mot rot, fungerar import och foton inte. Åtgärd: steg 4, 6 och 9 i den här guiden (en adress, omdirigering från alias). Ingen kodändring.
2. **`vercel.json` har `ignoreCommand: "exit 0"`**: Vercel hoppar över varje bygge. Medvetet tills flytten; Claude tar bort raden i steg 6. Glöms den blir inget publicerat.
3. **Deployment Protection** får inte gälla Production, annars når varken Siri-genvägen (`/api/snabb`, bara en nyckel som inloggning) eller inloggningslänkarna appen (steg 4).
4. **Fluid Compute på.** Vägarna för AI-import, fotoläsning och Förråd har `maxDuration` 300 (`/api/ai/jobs`, `/api/ai/jobs/photo`, `/api/things/photo`, `/api/things/retry`) och 60 för sidor och `/api/pantry/photo`. Hobby tillåter 300 s bara med Fluid Compute. AI-jobben är byggda för att bli klara 5 s före funktionens slut (`src/features/ai-jobs/domain/ai-job.ts`) och körs i `after()`, vilket Vercel stöder.
5. **AI i molnet är Claude, inte LM Studio.** Utan `ANTHROPIC_API_KEY` finns inget Claude-val, och med `AI_PROVIDER=lmstudio` utan tunnel når Vercel aldrig din Mac. Guiden använder `anthropic` + `claude-haiku-5-5`. Kostnaden syns i Inställningar → AI (`ai_usage`), och en månadsgräns sätts hos Anthropic (steg 0). `LMSTUDIO_BASE_URL` ska vara tom i Vercel, så syns inte "Qwen lokalt" som val.
6. **Foton följer inte med säkerhetskopian eller flytten av data (Story 17.4).** `backup.yml` tar bara data i `public` och `auth`, aldrig `storage`; fotomigrationerna skapar bara tomma buckets. Förrådsfoton (`thing-photo`) är dessutom din huvuddata, inte ett färskt hjälpfoto som `pantry-photo` (som bara visas i 30 dagar). Följden: efter en återställning och efter flytten från datorn pekar Förrådets rader på filer som saknas. Före flytten räcker det att veta det och att inte stänga av den lokala miljön; **Story 17.4 kopierar filerna ur lokala `thing-photo` och `pantry-photo` till molnets (`pnpm move:cloud`, steg 10)** (Storage API med secret key), och backupen bör få en kopia av `thing-photo` (Storage S3-protokollet eller `supabase storage cp`) innan molnet är din enda kopia.

### Före vänner

7. **Åtkomsttoken i webbläsarens JavaScript (Story 17.7).** `GET /api/realtime/session` lämnar ut den inloggades åtkomsttoken (`session.access_token`) som JSON till sidans skript, så att webbläsaren kan öppna realtidssockeln. Sessionskakorna är annars `httpOnly` just för att skript inte ska komma åt dem (AD-3), och det här hålet gör det halvvägs ogjort.

   **Bedömning.** Vid ett XSS-fel (någon får egen JavaScript att köra på sidan) kan angriparen i dag:
   - läsa ut en 1 timmes åtkomsttoken och använda den **från sin egen dator**, direkt mot Supabase REST, RPC och Storage med den publika nyckeln. Det går förbi appens egna kontroller (originkontrollen, indatavalideringen i serverkoden, AI-gränserna) och bara radskyddet återstår, i upp till en timme per utläsning;
   - upprepa utläsningen så länge sidan är öppen och därmed hålla tokenen vid liv;
   - **inte** komma åt förnyelsetoken eller kakan (den är `httpOnly`), så giltigheten är begränsad till en timme efter att sidan stängts.

   Utan rutten kan ett XSS-fel bara agera medan offrets webbläsare är öppen, via samma ursprung. Det är alltså en verklig men begränsad förvärring (medel allvar, låg sannolikhet: Reacts utskrift är escapad, och appen har inga `dangerouslySetInnerHTML` mot användardata, men ingen innehållspolicy (CSP) är satt). Med ett hushåll är risken liten; med vänner, som lägger in egna recept och egen text, är den inte det. Kvar att lösa **före** vänner.

   **Förslag, i ordning:**
   1. **Ingen token i webbläsaren, enklast och rekommenderat först:** ta bort rutten och låt sidorna hämta om sig själva (`router.refresh`) var 5–10 s medan fliken är synlig (`visibilitychange`), och direkt när fliken blir synlig igen. För några få hushåll och en inköpslista är det knappt märkbart och kostar nästan inget. Ingen annan kod berörs än `use-live-refresh.ts`.
   2. **Äkta push utan token i webbläsaren:** en Route Handler (`GET /api/realtime/stream`) som kontrollerar sessionen på servern och öppnar Realtime-sockeln *på servern* med användarens token, och skickar bara en tom "ändrat"-signal till webbläsaren som Server-Sent Events. Webbläsaren ser aldrig en token. Funktionen lever högst 300 s (Hobby), sedan återansluter `EventSource` själv. Mer kod, och en öppen funktion per öppen flik.
   3. **Om token i webbläsaren ändå ska finnas:** gör den **smal**, inte utbytbar mot hela användarens rättigheter. Realtime Broadcast på en privat kanal (`realtime.messages` med radskydd, databastriggrar som `realtime.broadcast_changes`) ger bara en smalare *kanal*, men den kräver fortfarande en JWT i webbläsaren, så den löser inte problemet ensam. Det som löser det är en kortlivad JWT (några minuter) för en egen databasroll (`realtime_listener`) som bara får `select` på de sju tabellerna med egen policy `using (user_id = (select auth.uid()))` och inga rättigheter på RPC, Storage eller övriga tabeller, signerad av servern med projektets JWT-nyckel. Då är en utläst token värdelös för skrivning och för allt utom egen inköpslistas läsning. Kräver att projektets signeringsnyckel hanteras (Supabase JWT Signing Keys), en migrering och tester; gör det bara om pollning inte räcker.
   4. **Oavsett val:** lägg en innehållspolicy (CSP, med nonce, i `proxy.ts` eller `next.config.ts`) och bekräfta att inga `dangerouslySetInnerHTML` får användartext. Det minskar sannolikheten för XSS i sig.
8. **E-post.** Supabase inbyggda utskick skickar bara till teammedlemmar. En vän får inget mejl med "Välj lösenord". Egen SMTP (steg 2 och 0.4) krävs före vänner, och det krävs en avsändardomän.
9. **Gränser för inloggningsförsök ligger i serverns minne** (fem fel per adress och IP på 15 minuter). På Vercel räknar varje instans för sig och en kall start nollställer. Sänk Supabases egna gränser (Authentication → Rate Limits) och se öppna fråga T7 (om `Sb-Forwarded-For` tas emot så att Supabase räknar per verklig IP).
10. **Gratisnivåns tak.** Supabase gratis: 500 MB databas, 1 GB lagring, ingen daglig säkerhetskopia, projektet pausas efter en veckas stillhet (veckokörningarna i `backup.yml` räknas som aktivitet). Förrådsfoton kan nå 1 GB med flera hushåll; då är Pro (25 USD/mån, med dagliga kopior) rätt. Besluta före vänner.

### Efter flytten

11. **Butikserbjudanden hämtas från Vercels IP-adresser.** ICA-sidor kan svara 403 eller 429 mot molntrafik; koden hanterar det (status sparas, `store_offers.attempted_at`) men resultatet är inte provat från molnet. Rökprovet visar det; fungerar det inte får erbjudandena bli manuella.
12. **Receptimport från molnet** går mot riktiga sajter med `safeFetch` (Node, DNS-kontroll). Provat lokalt; provas på riktigt i rökprovet.
13. **Härdning av den automatiska inloggningen.** Den kan inte slå till i molnet (se nedan), men en extra spärr kostar nästan inget: vägra starta (i `src/server/env.ts`) om `NODE_ENV=production` och `DEV_AUTO_LOGIN_*` är satta. Inte gjort; inga ändringar i appens beteende ingår i förberedelsen.
14. **`config.toml` pekar på `./seed.sql`** som inte finns (varning vid `supabase start`, harmlöst).
15. **Hobby är för icke-kommersiellt bruk.** Räcker för hushåll och några vänner.
16. **Cron och bakgrundsjobb:** inga. Det finns inga `cron`-rutter, ingen `setInterval` på servern och inga köer som kräver en långlevande process. Allt bakgrundsarbete (AI-jobb, uppvärmning, städning av foton) körs i `after()` i samma funktion som tog emot anropet, och en väntande AI-kö äts av jobbens egen tidsgräns. Uppvärmningsrutten `/api/ai/warm` gör ingenting för Claude (`skipped: provider`).

### Granskat och i sin ordning

- **Automatisk inloggning (Story 15.1) kan inte slå till i produktion.** `devAutoLoginCredentials` (`src/lib/supabase/dev-auto-login.ts`) kräver *alla* av: `NODE_ENV === "development"` (Vercel och `next start` är `production`), `VERCEL` osatt (Vercel sätter den), `MATKOLL_DEV_LOOPBACK === "1"` (sätts bara av `pnpm dev`), inga proxyrubriker, `Host` och `X-Forwarded-Host` lokala, och en lokal Supabase-adress. Dessutom finns inga värden för `DEV_AUTO_LOGIN_*` i Vercel. Var och en av de sex spärrarna räcker ensam. Enhetstester täcker varje spärr.
- **Localhost och 127.0.0.1 i koden:** bara i kommentarer, i testdata, i spärrarna ovan, i `siteSource` (testsidor används bara med `AI_PROVIDER=mock` *och* lokal `SITE_URL`) och i en text i Inställningar som säger att Siri inte når `localhost`. `devSiteUrl` (`http://localhost:3000`) används bara när `SITE_URL` saknas utanför produktion; i produktion kräver `parseEnv` `SITE_URL`.
- **Filstorlekar mot Vercels gränser:** förfrågningar till funktioner får vara 4,5 MB. Fotorutterna tar högst 1,5 MB + 64 kB (`/api/pantry/photo`, `/api/things/photo`) och 2 MB (`/api/ai/jobs/photo`), och webbläsaren skalar ned före uppladdning. Inget går över gränsen. Inga Server Actions tar emot filer.
- **Edge eller Node:** ingen rutt väljer Edge. `proxy.ts` och allt annat körs i Node; `instrumentation.ts` kör miljökontrollen bara i Node. Inga Node-API:er behöver bytas.
- **Realtid:** webbläsaren öppnar `wss://<ref>.supabase.co/realtime/v1` med användarens token; `postgres_changes` följer radskyddet. Ingen särskild inställning i panelen behövs; publikationen sätts av migrationen. (Tokenfrågan: punkt 7.)
- **Sessionskakor:** `secure` när `SITE_URL` börjar med `https://`, `httpOnly`, `SameSite=Lax`, 90 dagar.
- **E-postavsändaren** sätts i Supabase (steg 2), inte i koden; appen skickar inga mejl själv.
- **Hemligheter i repot:** `.env.example` har bara namn. CI-flödena läser hemligheter bara via `env` och skriver aldrig ut dem.

## Filer som förberedelsen lade till eller ändrade

- `docs/molnet.md` (den här filen)
- `scripts/move-to-cloud.ts`, `scripts/move-to-cloud/` och `scripts/test-move-to-cloud.sh` (Story 17.4: flyttskriptet och dess tvåstackstest)
- `.github/workflows/cloud-migrate.yml` (ny, avstängd tills `CLOUD_ENABLED=true`)
- `.github/workflows/backup.yml` (`CLOUD_ENABLED` slår på den; hoppas över när varken den eller `BACKUP_ENABLED` är satt)
- `.env.example` (bara kommentarer: var varje värde sätts)
- `vercel.json` (`"regions": ["arn1"]`)
- `supabase/config.toml` (ämnesraderna i inloggningsmejlen säger Livskoll i stället för Matkoll, som mallarna)
- `tests/lint/backup-workflow.test.ts` (följer ändringen i `backup.yml`)
