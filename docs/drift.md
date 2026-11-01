# Matkoll – drift i molnet

> Den som följs steg för steg vid flytten är [`docs/molnet.md`](molnet.md) (Story 17.3); den här filen är fördjupningen och gäller i övrigt. Nytt sedan den skrevs: strömbrytaren `CLOUD_ENABLED` (flödet `cloud-migrate.yml` kör `supabase db push` på `main`, och `backup.yml` slås på med den), AI via Claude i stället för LM Studio och Cloudflare Tunnel, och ämnesraderna Livskoll.

Så här sätts molnet upp när Epic 1–3 fungerar lokalt. Allt som går att förbereda i repot är gjort; stegen här kräver Pontus konton och görs av Pontus. Den korta listan finns i [Checklista för Pontus](oppna-fragor.md#checklista-för-pontus-när-molnet-sätts-upp-efter-epic-13); den här filen beskriver varje punkt: vad du gör, var värdet hämtas och hur du kontrollerar det.

Inga riktiga värden skrivs in i repot (AD-14). Adresser, nycklar och lösenord läggs bara i Vercel, i GitHub-hemligheterna eller tillfälligt i din terminal. `<adress>` nedan är appens publika adress, till exempel `https://matkoll.vercel.app` eller en egen domän, och `<ref>` är Supabase-projektets id.

## Översikt

| # | Steg | Var |
| --- | --- | --- |
| 1 | Vercel-projektet `matkoll` i `arn1` | Vercel |
| 2 | Supabase-projektet `matkoll` i `eu-north-1` | Supabase |
| 3 | Registrering avstängd | Supabase |
| 4 | Site URL och redirect-URL | Supabase |
| 5 | E-postmallen och eventuellt egen SMTP | Supabase |
| 6 | Schemat: `supabase link` och `supabase db push` | din terminal |
| 7 | Användarna: `pnpm users:sync` mot molnet | din terminal |
| 8 | Cloudflare Tunnel och Access för LM Studio | Cloudflare, din Mac |
| 9 | Miljövariablerna i Vercel | Vercel |
| 10 | Säkerhetskopian: GitHub-hemligheterna och `BACKUP_ENABLED` | GitHub |
| 11 | Första publiceringen | Vercel |

Vercel-projektet skapas först men fylls med variabler i steg 9, när värdena från Supabase och Cloudflare finns.

## 1. Vercel-projektet

1. Vercel → **Add New → Project** → importera GitHub-repot och ge projektet namnet `matkoll`. Ramverket känns igen som Next.js; ändra inte bygg- eller startkommandot. Lägg inte in några variabler än, och avbryt eller strunta i den första automatiska driftsättningen (den misslyckas utan `SITE_URL` och `AI_PROVIDER`, vilket är väntat).
2. **Settings → Git → Production Branch:** `main`. Produktion byggs bara från `main` (AD-23).
3. **Settings → Functions → Function Region:** Stockholm, `arn1` (samma stad som databasen).
4. Inställningarna ovan görs i Vercel. Repots `vercel.json` har bara `"ignoreCommand": "exit 0"`, som gör att Vercel hoppar över varje bygge tills molnet är uppsatt, så att inga misslyckade byggen och mejl kommer (2026-10-26). Den tas bort i steg 11. Importvägarna har `maxDuration = 120`, vilket ryms i Hobby-planen.

**Kontroll:** projektet heter `matkoll`, Production Branch är `main` och regionen är `arn1`.

## 2. Supabase-projektet

1. Supabase → **New project** → namn `matkoll`, region **North EU (Stockholm), `eu-north-1`**. Välj ett starkt databaslösenord och spara det i din lösenordshanterare; det behövs i steg 6 och 10.
2. Anteckna `<ref>` (syns i projektets adress, `https://<ref>.supabase.co`).
3. Om projektet erbjuder att automatiskt exponera nya tabeller i Data API kan du stänga av det, som `auto_expose_new_tables = false` lokalt. Det är inte nödvändigt: migrationerna tar själva bort standardrättigheterna och ger varje tabell sina egna (AD-4).
4. Projektet måste ha **PostgreSQL 17 eller senare**, som lokalt (`major_version = 17` i `supabase/config.toml`). Migrationerna `catalog_name_capital` och `catalog_name_rule` (Story 10.4) använder kollationen `pg_c_utf8`, som finns från version 17, och stoppar med ett tydligt fel på en äldre version.
5. Storage behöver inte slås på. Det ingår i gratisnivån (1 GB), och Matkoll sparar högst ett foto per plats och ställe, högst 1,5 MB (Epic 10). Ett foto som är äldre än 30 dagar visas aldrig, och det gallras nästa gång Lagersaldo öppnas eller ett foto sparas. Den privata bucketen `pantry-photo` och dess policyer skapas av `supabase db push` i steg 6, inte i panelen.

**Kontroll:** **Project Settings → General** visar regionen `eu-north-1`, och **Project Settings → Infrastructure** visar Postgres 17 eller senare.

## 3. Registrering avstängd, konton görs av `users:sync`

**Authentication → Sign In / Providers:** stäng av **Allow new users to sign up**. E-post ska vara på. Lokalt motsvaras det av `enable_signup = false` i `supabase/config.toml` (AD-3). Ingen kan skapa sig själv ett konto; det finns därför inget "Skapa konto" i appen, och ingen kan registrera en inbjuden adress med eget lösenord i förväg.

Konton görs bara av `pnpm users:sync`, som läser `ALLOWED_EMAILS` och skapar användare utan lösenord (adressen räknas som bekräftad). Så här bjuder Pontus in någon:

1. Lägg adressen i `ALLOWED_EMAILS` (Vercel och lokalt) och kör `pnpm users:sync`.
2. Säg åt personen att öppna appen och välja **Första gången eller glömt lösenordet? Välj lösenord**. Mejlet har en länk där hen väljer lösenord (minst 12 tecken) och blir inloggad. Samma väg gäller om någon glömt sitt lösenord.
3. Kommer inget mejl? Appen svarar likadant för alla adresser, så ett stavfel i `ALLOWED_EMAILS` eller en glömd `pnpm users:sync` syns bara som tystnad. Kontrollera adressen och att `users:sync` har körts.

Lägg in mejlmallen **Reset Password** från `supabase/templates/recovery.html` (`type=recovery`), som för engångslänken; länken går till `/auth/confirm`. Lokalt läses mallen när Supabase startas, så `pnpm db:stop && pnpm db:start` behövs en gång efter Story 17.2.

**Gränser för inloggningsförsök.** Appens egna gränser (fem felaktiga lösenord, fem koder och fem mejl för "Välj lösenord" per adress och IP på 15 minuter) ligger i serverns minne. På Vercel räknar varje instans för sig och en kall start nollställer, så de är ett första skydd, inte ett tak. I molnet gäller också Supabases egna gränser: kontrollera under **Authentication → Rate Limits** antalet mejl per timme (kräver egen SMTP), inloggningar och registreringar per IP, och verifieringar av engångskoder per IP, och sänk dem om standardvärdena är för höga.

**Kontroll:** efter steg 11, be om en länk med **Välj lösenord** för en adress som inte står i `ALLOWED_EMAILS`. Sidan svarar som vanligt, men inget mejl kommer och ingen användare skapas under **Authentication → Users**.

## 4. Site URL och redirect-URL

**Authentication → URL Configuration:**

- **Site URL:** `<adress>`
- **Redirect URLs:** lägg till `<adress>/auth/confirm**`

Länken i mejlet går till `<adress>/auth/confirm?next=…` (appen bygger den från `SITE_URL`). Stjärnorna behövs för `?next=`. Om adressen inte står på listan skickar Supabase i stället Site URL, och då fungerar inte inloggningen.

**Kontroll:** i steg 11 ska länken i mejlet börja med `<adress>/auth/confirm?`.

## 5. E-postmallen och SMTP

**Authentication → Emails → Templates → Magic Link:**

- **Subject:** `Din inloggningslänk till Livskoll`
- **Body:** innehållet i `supabase/templates/magic-link.html`, oförändrat (samma som lokalt, se `[auth.email.template.magic_link]` i `supabase/config.toml`). Från Epic 11 (Story 11.6) har mallen både länken och den sexsiffriga koden `{{ .Token }}` under texten "Eller skriv in koden i Matkoll:". Koden behövs för att logga in i Matkoll på hemskärmen, som inte delar inloggning med Safari, där länken öppnas. Har du lagt in en äldre mall: klistra in den nya, annars kommer bara länken i mejlet.

**Authentication → Sign In / Providers → Email:**

- **Email OTP Length:** `6` (som `otp_length` lokalt). Inloggningssidan tar bara emot sex siffror.
- **Email OTP Expiration:** `3600` sekunder (som `otp_expiry` lokalt). Länken och koden gäller då i en timme, och när den ena har använts går ingen av dem att använda igen.
- Supabase begränsar hur ofta en kod eller länk kan skickas (en gång i minuten per adress som standard) och hur många inloggningsförsök som görs per IP (under **Authentication → Rate Limits**). Låt standardvärdena stå kvar. Appen skickar webbläsarens IP till Supabase i rubriken `Sb-Forwarded-For`, eftersom koden kontrolleras från Vercel; om molnet inte tar emot den räknar Supabase per Vercel-IP (öppen fråga T7). Appen har dessutom en egen gräns: 5 fel koder per adress och IP på 15 minuter, per serverinstans.
- **Allow new users to sign up** ska vara avstängd (steg 3). Varken länken eller koden kan då skapa en användare (`shouldCreateUser: false`), bara logga in dem som `pnpm users:sync` har skapat. Låt e-postinloggningen (**Email**-leverantören) vara på; det är den som skickar länken och koden.
- Länken i mejlet öppnar en sida med knappen "Logga in", och först knappen loggar in. Då kan inte en länkskanner i e-posten (till exempel Microsoft Safe Links) använda upp länken och koden genom att öppna länken i förväg.

Supabase inbyggda e-post skickar bara till projektets teammedlemmar och bara några mejl i timmen. Det räcker så länge bara du loggar in, med samma adress som ditt Supabase-konto. Ska fler logga in, eller tar gränsen slut: lägg in egen SMTP under **Authentication → Emails → SMTP Settings** (till exempel Resend eller Postmark, med avsändaradress på en egen domän).

**Kontroll:** mejlet i steg 11 har ämnet och texten från mallen ("Logga in på Matkoll"), länken och en sexsiffrig kod i stor text. Skicka en ny länk, skriv in koden på inloggningssidan och tryck "Logga in": du ska komma till Recept.

## 6. Schemat: `supabase link` och `supabase db push`

Schemat ändras bara med migrationer (AD-5). Första gången körs de från din terminal (efteråt tar flödet `cloud-migrate.yml` över när `CLOUD_ENABLED` är på, se `docs/molnet.md`):

```bash
pnpm exec supabase login                      # öppnar webbläsaren; sparar en åtkomsttoken lokalt
pnpm exec supabase link --project-ref <ref>   # frågar efter databaslösenordet från steg 2
pnpm exec supabase db push                    # kör migrationerna som saknas i molnet
```

Kör `supabase db push` **före varje koddriftsättning** som har nya filer i `supabase/migrations/`, det vill säga innan grenen slås ihop till `main` (AD-23). Migrationerna är bakåtkompatibla med föregående kod, så den gamla koden fungerar medan den nya byggs. Kör aldrig `supabase db reset` mot något projekt.

**Kontroll:** `pnpm exec supabase migration list` visar samma versioner under Local och Remote.

### Lagret före och efter ställena (1.1, Story 8.1)

Migrationen `*_pantry_site.sql` lägger alla befintliga lagervaror på stället "Hemma" (NFR-9, AD-24). Den lägger bara till och får inte ändra, flytta eller ta bort någon vara. Kontrollera det med `scripts/pantry-site-check.sql` före och efter `supabase db push`, i samma terminal:

```bash
psql "<Session pooler-strängen utan lösenord>" -X -q -A -t -F ' ' -v ON_ERROR_STOP=1 -f scripts/pantry-site-check.sql > ~/matkoll-pantry-fore.txt
pnpm exec supabase db push
psql "<Session pooler-strängen utan lösenord>" -X -q -A -t -F ' ' -v ON_ERROR_STOP=1 -f scripts/pantry-site-check.sql > ~/matkoll-pantry-efter.txt
diff ~/matkoll-pantry-fore.txt ~/matkoll-pantry-efter.txt
```

Skriptet skriver varje rad i `pantry_item` (`id`, användare, katalogvara, plats, mängd, enhet och `created_at`, sorterade på `id`) och antalet rader. Efter migreringen kontrollerar det också eftervillkoren: varje vara ligger på ett ställe som tillhör samma användare, varje användare har exakt ett valt ställe, och varje sparad rad för "Ångra" har sitt ställe. Eftervillkoren skriver inget till filen, bara `NOTICE: pantry-site-check: the postconditions hold`, och ett brutet villkor stoppar skriptet med ett fel.

Skriptet skriver också varje post i `pantry_removal` (underlaget för "Ångra") med raderna i samma ordning men utan `site_id`, och stoppar om `removed_rows` inte är en lista.

1.0-koden fungerar mot det nya schemat under driftsättningen: den läser `pantry_item` via PostgREST och skriver bara via Postgres-funktionerna, som utan `site` gäller valt ställe. Koden i 1.0 (`93c5301`) är genomsökt efter `.upsert(` och `onConflict` mot `pantry_item`, och det finns inga, så den gamla unika nyckeln behövs inte. Att rulla tillbaka koden till 1.0 är däremot **inte säkert när ett andra ställe finns** (från Story 8.2): 1.0 läser alla rader och skulle summera lagret över ställena. Rulla i så fall bara tillbaka till en version från Epic 8.

**Kontroll:** `diff` visar inga skillnader. Använd inte appen mellan de två körningarna, eftersom en vara som läggs till eller tas bort då syns som en skillnad. Lokalt körs samma kontroll före och efter `supabase migration up`, med `docker exec -i supabase_db_matkoll psql -U postgres -d postgres` i stället för `psql "<...>"` och skriptet på standard in (`< scripts/pantry-site-check.sql`).

## 7. Användarna: `pnpm users:sync`

`pnpm users:sync` skapar användarna i `ALLOWED_EMAILS` (AD-3). Mot molnet behövs projektets hemliga nyckel. Den används bara här, tillfälligt i terminalen; den läggs aldrig i Vercel, aldrig i `.env.local` och aldrig i repot.

```bash
read -rs SUPABASE_SERVICE_ROLE_KEY            # klistra in nyckeln; den syns inte och hamnar inte i historiken
export SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co ALLOWED_EMAILS=<din e-post> pnpm users:sync
unset SUPABASE_SERVICE_ROLE_KEY
```

Nyckeln finns under **Project Settings → API Keys → Secret keys** (`sb_secret_…`). Variablerna i terminalen går före `.env.local`, så den lokala filen ändras inte. `ALLOWED_EMAILS` ska ha samma adresser som i Vercel (steg 9). Kör om kommandot när listan ändras; `--prune` tar bort användare som inte längre står i den.

Ta helst bort en användare med `pnpm users:sync --prune` (Story 10.3). För varje användare som inte står i `ALLOWED_EMAILS` gör skriptet så här:

1. Användaren spärras, så att ingen ny inloggning kan ladda upp ett foto medan filerna tas bort.
2. Användarens foton i bucketen `pantry-photo` tas bort.
3. Användaren tas bort, och raderna följer med.
4. Användarens mapp listas en gång till, och det som finns kvar tas bort.

Går fotona inte att ta bort står användaren kvar, spärrad. Går användaren inte att ta bort när filerna redan är borta tas användarens fotorader bort, så att ingen rad pekar på en fil som saknas. En användare som misslyckas stoppar inte de andra, och skriptet avslutas med ett fel på slutet. Utdata visar bara användarnas id och antal, aldrig adresser till de borttagna eller sökvägar.

En borttagning under **Authentication → Users** i Supabase-panelen tar bara raderna och lämnar filerna kvar i bucketen. Appens gallring når dem inte, eftersom den körs som den inloggade användaren. Därför tar varje körning av `pnpm users:sync`, med eller utan `--prune`, också bort filerna för användare som inte längre finns. En mapp tas bara bort när Supabase Auth svarar att användaren inte finns.

**Kontroll:** **Authentication → Users** visar din adress, och utdata har inga fel.

## 8. Cloudflare Tunnel och Access för LM Studio

Appen i Vercel når LM Studio på din Mac genom en Cloudflare Tunnel, skyddad av Cloudflare Access med en tjänstetoken. LM Studio lyssnar fortfarande bara på localhost. Det kräver en domän i Cloudflare.

1. **Zero Trust → Networks → Tunnels → Create a tunnel** (Cloudflared). Installera `cloudflared` på din Mac enligt anvisningen och starta den som tjänst.
2. **Public hostname:** till exempel `lmstudio.<din domän>` → tjänst `http://localhost:1234`.
3. **Zero Trust → Access → Service Auth → Service Tokens → Create Service Token.** Spara Client ID och Client Secret direkt; hemligheten visas bara en gång.
4. **Zero Trust → Access → Applications → Add an application → Self-hosted** för `lmstudio.<din domän>`, med en policy vars åtgärd är **Service Auth** och som bara släpper in tjänstetokenen.
5. Värdena till steg 9: `LMSTUDIO_BASE_URL=https://lmstudio.<din domän>/v1`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` och `AI_PROVIDER=lmstudio`.

Macen måste vara vaken, på laddare, med LM Studio och modellen igång när du importerar recept.

**Kontroll:** utan token nekas anropet; med token svarar LM Studio med modellistan:

```bash
curl -sI https://lmstudio.<din domän>/v1/models | head -1           # 302 eller 403
curl -s https://lmstudio.<din domän>/v1/models \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" | head -c 200   # {"data":[…
```

## 9. Miljövariablerna i Vercel

**Settings → Environment Variables.** Bara namnen i AD-14 och `.env.example` finns; appen validerar dem i `src/server/env.ts` och startar inte om något saknas eller inte passar ihop.

| Variabel | Värde och var det hämtas | Production | Preview |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` (**Project Settings → Data API**) | ja | nej |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (**Project Settings → API Keys**) | ja | nej |
| `SITE_URL` | `<adress>`, samma som Site URL i steg 4 | ja | ja, samma värde |
| `ALLOWED_EMAILS` | din e-post, kommaseparerat om fler | ja | nej |
| `AI_PROVIDER` | `lmstudio` | ja | `mock` |
| `AI_MODEL` | tomt (standard `qwen/qwen3.6-35b-a3b`) eller modellens id | vid behov | nej |
| `LMSTUDIO_BASE_URL` | `https://lmstudio.<din domän>/v1` (steg 8) | ja | nej |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | tjänstetokenen (steg 8); båda eller ingen | ja | nej |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | bara om `AI_PROVIDER` väljer den leverantören | vid behov | nej |
| `AI_MOCK_DELAY_MS` | sätts aldrig (bara mocken läser den, så att AI-kön kan provas i tester) | nej | tomt (e2e-testerna sätter 3000) |

- Supabase-variablerna ligger **bara i Production**, aldrig i Preview (AD-23), så att en förhandsdriftsättning från en gren aldrig når den riktiga databasen. Preview får bara `SITE_URL` och `AI_PROVIDER=mock`, som `next build` kräver. Kontrollerat lokalt 2026-10-26: `SITE_URL=… AI_PROVIDER=mock pnpm build` utan Supabase-variabler, `ALLOWED_EMAILS` och `.env.local` bygger, och servern svarar sedan 503 på sidorna (`supabase_not_configured`) i stället för att nå någon databas. En förhandsversion fungerar alltså bara som byggkontroll. Vill du hellre slippa förhandsversioner helt kan de stängas av under **Settings → Git**; valet står i checklistan.
- `SUPABASE_SERVICE_ROLE_KEY` läggs **aldrig** i Vercel. Den läses bara av `scripts/` och `tests/` (AD-4) och används bara tillfälligt i steg 7.
- Markera hemliga värden (`CF_ACCESS_CLIENT_SECRET`, eventuella API-nycklar) som **Sensitive**.

**Kontroll:** en driftsättning efter ändrade variabler bygger utan fel från `src/server/env.ts`; variablerna gäller först i nästa driftsättning.

## 10. Säkerhetskopian: GitHub-hemligheterna och `BACKUP_ENABLED`

`.github/workflows/backup.yml` gör varje måndag och torsdag (03:17 UTC) en krypterad `supabase db dump` och sparar den som artefakten `matkoll-backup-<ÅÅÅÅ-MM-DD>` i 90 dagar (AD-23). Körningen håller också gratisprojektet aktivt. Den kör bara på `main`.

Under **GitHub → repot → Settings → Secrets and variables → Actions**:

| Namn | Typ | Värde |
| --- | --- | --- |
| `SUPABASE_DB_URL` | Secret | Kopiera **Session pooler**-strängen från Supabase → **Connect** och byt platshållaren mot databaslösenordet från steg 2, procentkodat om det har specialtecken (till exempel `@` som `%40`). Använd Session pooler: den direkta anslutningen är bara IPv6, som GitHubs maskiner saknar, och Transaction pooler fungerar inte med `pg_dump`. |
| `BACKUP_PASSPHRASE` | Secret | Minst 32 tecken utan radbrytning, till exempel från `openssl rand -base64 32` (44 tecken). Klistra in den utan avslutande radbrytning. Spara den i din lösenordshanterare: utan den går säkerhetskopiorna inte att läsa. |
| `BACKUP_ENABLED` | Variable (fliken **Variables**) | `true`, när de två hemligheterna finns |

Så beter sig flödet:

- **Utan `BACKUP_ENABLED`** och utan hemligheterna hoppar körningen över dumpen, blir grön och visar notisen "Säkerhetskopian hoppades över: hemligheten … saknas. Se docs/drift.md." i sammanfattningen. Så ser det ut tills det här steget är gjort.
- **Med `BACKUP_ENABLED=true`** blir körningen röd om en hemlighet saknas, så att en borttagen eller utgången hemlighet inte tystar säkerhetskopian.
- Körningen blir också röd, med bara problemet och aldrig värdet i felet, om lösenfrasen är kortare än 32 tecken eller har en radbrytning, eller om `SUPABASE_DB_URL` inte är en `postgresql://`-adress med lösenord.
- Efter dumpen kontrolleras att alla fyra filerna har innehåll och att `data.sql` har `auth.users`. Varje fil krypteras med AES256, dekrypteras igen och jämförs med originalet innan något laddas upp. Bara `.gpg`-filerna laddas upp.
- Hemligheterna läses bara som miljövariabler och skrivs aldrig ut. Lösenordet i `SUPABASE_DB_URL` maskeras i loggen, både som det står i adressen och avkodat. På kommandoraden för `supabase db dump` och `psql` står adressen **utan** lösenord (användare `postgres.<ref>`, värd, port och databas); lösenordet ligger i miljövariabeln `PGPASSWORD`, som CLI:t lämnar vidare till sin `pg_dump`-container som miljövariabel. Lösenfrasen ges till `gpg` på stdin, aldrig som argument.
- Flödet är inte en obligatorisk kontroll på `main` och anropar varken Vercel, `supabase link` eller `supabase db push`.

Att tänka på med schemalagda flöden:

- GitHub kör schemalagda flöden bara från standardgrenen. Flödet startar alltså först när det ligger på `main`; i epic-grenen körs det inte.
- GitHub stänger av schemalagda flöden efter 60 dagar utan aktivitet i repot. Då står det under **Actions → Backup**; slå på det igen med **Enable workflow** och kör det en gång för hand.
- Mejlet om en misslyckad schemalagd körning går till den användare som senast ändrade `cron`-raden i flödesfilen. Kontrollera efter sammanslagningen till `main` att det är ditt GitHub-konto (`git log -1 --format='%an %ae' -G'cron:' -- .github/workflows/backup.yml`; annars ändra raden själv i en egen commit), och att **GitHub → Settings → Notifications → Actions** skickar e-post för misslyckade flöden.

**Kontroll:** kör **Actions → Backup → Run workflow** på `main` en gång innan hemligheterna finns (grön, med notisen). Lägg sedan in hemligheterna och `BACKUP_ENABLED=true` och kör igen. Körningen ska bli grön och ha artefakten `matkoll-backup-<datum>` med `schema.sql.gpg`, `data.sql.gpg`, `manifest.txt.gpg` och `counts.txt.gpg`.

**Spara en kopia utanför GitHub.** Artefakterna ligger i 90 dagar i samma konto som repot. Ladda ner den senaste en gång i månaden och spara zip-filen på ett säkert ställe (den är krypterad, men lösenfrasen ska inte ligga bredvid).

### Vad säkerhetskopian innehåller

Kontrollerat 2026-10-26 med samma CLI-version mot den lokala stacken: `supabase db dump --dry-run`, verkliga dumpar och en återläsning i en separat, tillfällig lokal stack. Provat igen samma dag med sparade foton i databasen (Story 10.3).

**Foton tas aldrig med** (AD-26, NFR-11). Filerna ligger i Storage och inte i databasen, och dumpen utesluter fotonas rader och filernas sökvägar. Efter en återställning finns inga foton. De går inte att få tillbaka, men ett nytt foto tas nästa gång Pontus fotograferar platsen, och ett foto visas ändå bara i 30 dagar.

- `schema.sql` (`supabase db dump`): det egna schemat, främst `public` med tabeller, funktioner, RLS-policyer och rättigheter. `auth`, `storage` och andra scheman som Supabase sköter tas inte med; ett nytt projekt har dem redan. Matkolls enda objekt där, bucketen `pantry-photo` och dess policyer på `storage.objects`, skapas av fotomigrationerna när schemat läses in med `supabase db push` (punkt 3 under Återställning).
- `data.sql` (`supabase db dump --data-only --schema public,auth`): bara data i schemana `public` och `auth`, alltså även `auth.users` och `auth.identities`, som alla rader refererar via `user_id`. Inget ur schemat `storage` tas med (Story 10.3): varken bucketen, filernas sökvägar eller uppladdningarna. Fotomigrationen skapar bucketen igen vid en återställning. Utelämnas gör också:
  - fotonas rader, `public.pantry_photo` (med avläsningen);
  - AI-jobbens rader, `public.ai_job` (Story 12.4): tillfälliga resultat som ändå försvinner efter högst ett dygn. Schemat tas med i `schema.sql`, så tabellen finns efter en återställning, men tom;
  - inloggningarnas tillfälliga och känsliga data: `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_amr_claims` (hör till sessionerna), `auth.one_time_tokens`, `auth.flow_state` och `auth.audit_log_entries`. De behövs inte för en återställning; efteråt loggar alla in på nytt.

  Innan något krypteras kontrollerar flödet att `data.sql` inte har någon rad ur `storage`, `pantry_photo` eller `ai_job` och inte bucketens id `pantry-photo`. Annars stoppar körningen med ett fel, som inte visar någon rad ur dumpen. Migrationshistoriken (`supabase_migrations`) ingår inte.
- `manifest.txt`: commiten som körningen gjordes från, CLI-versionen och de migrationer som är körda i molnet (från `supabase_migrations.schema_migrations`).
- `counts.txt`: antal rader i `auth.users` och i varje tabell i `public` utom `pantry_photo` och `ai_job`, från `scripts/backup-counts.sql`, räknade strax före dumpen.
- Roller dumpas inte: Matkoll skapar inga egna roller, och Supabase standardroller finns i varje nytt projekt.

### Återställning

Återställ till ett **nytt** Supabase-projekt. Stegen är provade lokalt: efter återläsningen hade `auth.users` och alla tabeller i `public` samma antal rader som `counts.txt`, policyer, funktioner och rättigheter var desamma, inloggningen fungerade och RLS släppte bara in ägaren.

Alla okrypterade filer, också `nu.sql` nedan, ligger i en egen mapp utanför repot som bara du kan läsa. Ta bort den när du är klar. (`.gitignore` stoppar dessutom `.sql`-filer i repots rot.)

1. Hämta artefakten under **Actions → Backup → körningen → Artifacts**, och dekryptera i mappen (frågar efter `BACKUP_PASSPHRASE`; `gpg` finns i `brew install gnupg`):

   ```bash
   mkdir -m 700 ~/matkoll-restore && cd ~/matkoll-restore
   unzip ~/Downloads/matkoll-backup-<datum>.zip
   for f in schema.sql data.sql manifest.txt counts.txt; do gpg --output "$f" --decrypt "$f.gpg"; done
   ```

2. Skapa ett nytt projekt och gör steg 2–5 för det.
3. Hitta en commit vars migrationer är exakt de i `manifest.txt` (molnet kan ligga före eller efter `main`, så körningens commit räcker inte), och läs in schemat med migrationerna därifrån:

   ```bash
   cd <repot>
   sed -n '/^migrations$/,$p' ~/matkoll-restore/manifest.txt | tail -n +2 > ~/matkoll-restore/versioner.txt
   senaste=$(tail -1 ~/matkoll-restore/versioner.txt)
   git switch --detach "$(git log main -1 --format=%H --diff-filter=A -- "supabase/migrations/${senaste}_*.sql")"
   ls supabase/migrations | cut -d_ -f1 | diff - ~/matkoll-restore/versioner.txt && echo "samma migrationer"
   pnpm exec supabase link --project-ref <ny ref>
   pnpm exec supabase db push
   ```

   Visar `diff` skillnader, välj en annan commit (till exempel `commit` i `manifest.txt`) tills de stämmer. Schemat läses inte in från `schema.sql`: den saknar migrationernas `revoke`, så ett nytt projekt skulle ge `anon` rättigheter till alla tabeller (mot AD-4), och utan migrationshistorik misslyckas nästa `db push`. Använd `schema.sql` som jämförelse: `pnpm exec supabase db dump --linked -f ~/matkoll-restore/nu.sql` och `diff ~/matkoll-restore/schema.sql ~/matkoll-restore/nu.sql` ska bara visa rader med `ALTER DEFAULT PRIVILEGES`, som beror på projektets inställning för nya tabeller (steg 2).
4. Läs in datan med `psql` (`brew install libpq`; programmet ligger i `$(brew --prefix libpq)/bin/psql`). Kopiera Session pooler-strängen för det nya projektet från **Connect** och ta bort `:<lösenord>` ur den, så frågar `psql` efter lösenordet och det hamnar inte i historiken:

   ```bash
   psql "<Session pooler-strängen utan lösenord>" \
     --single-transaction --variable ON_ERROR_STOP=1 \
     --command 'SET session_replication_role = replica' \
     --file ~/matkoll-restore/data.sql
   ```

   `session_replication_role = replica` stänger av triggrar och främmande nycklar under inläsningen, så ordningen mellan tabellerna spelar ingen roll. Allt läses in i en transaktion; vid fel ändras ingenting.
5. Jämför antalet rader (från repot, med samma sträng):

   ```bash
   psql "<Session pooler-strängen utan lösenord>" -X -q -A -t -F ' ' -f scripts/backup-counts.sql > ~/matkoll-restore/counts-nu.txt
   diff ~/matkoll-restore/counts.txt ~/matkoll-restore/counts-nu.txt && echo "samma antal"
   ```

   Användes appen medan säkerhetskopian togs kan antalet skilja lite.

   Kontrollera också fotonas bucket och policyer. De finns i schemat `storage`, som varken `schema.sql` eller `data.sql` tar med, och skapades av fotomigrationerna i punkt 3:

   ```bash
   psql "<Session pooler-strängen utan lösenord>" -X -A -t \
     -c "select id, public from storage.buckets where id = 'pantry-photo'" \
     -c "select policyname from pg_policies where schemaname = 'storage' and policyname like 'pantry_photo_%' order by 1" \
     -c "select count(*) from public.pantry_photo"
   ```

   Svaret ska vara `pantry-photo|f`, de tre policyerna `pantry_photo_delete`, `pantry_photo_insert` och `pantry_photo_select`, och `0` foton. Saknas bucketen eller en policy har schemat inte lästs in med `db push` som i punkt 3. Gör om punkt 3 och 4 i ett nytt projekt i stället för att lägga till dem för hand.
6. Gå tillbaka till `main` och kör migrationerna som har kommit till sedan säkerhetskopian, innan appen pekas om:

   ```bash
   git switch main
   pnpm exec supabase db push
   ```

7. Peka om: nya `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` i Vercel (steg 9), driftsätt igen och logga in. Byt `SUPABASE_DB_URL` i GitHub (steg 10). Ta bort `~/matkoll-restore`.

**Om `auth`-schemat har ändrats.** Ett nytt projekt kan ha en nyare version av Supabase Auth än det gamla. `COPY`-raderna i `data.sql` anger sina kolumner, så nya kolumner får standardvärden; inläsningen stoppar bara om en kolumn har tagits bort eller bytt namn. Då:

- Läs in bara `auth.users` och `auth.identities` med de kolumner som finns i båda: ta deras `COPY`-block ur `data.sql`, ta bort de saknade kolumnerna ur kolumnlistan och värdena ur raderna, och läs in resten av filen utan `auth`-blocken.
- Eller skapa användarna på nytt med `pnpm users:sync` (steg 7). De får nya id, så byt de gamla id:na mot de nya i `data.sql` innan resten läses in: hämta paren e-post och gammalt id ur blocket `COPY "auth"."users"`, nya id under **Authentication → Users**, och ersätt varje gammalt id med `sed`. Ta sedan bort alla `COPY "auth".`-block och läs in filen som i punkt 4.

## 11. Första publiceringen

Den första publiceringen i produktion kräver Pontus godkännande (AD-23), så den görs för hand när steg 1–10 är klara:

1. Kontrollera att `supabase db push` är körd (steg 6) och att variablerna finns (steg 9).
   - Ta bort `ignoreCommand` ur `vercel.json` (eller hela filen) i en PR till `main`. Annars hoppar Vercel över bygget.
2. Vercel → **Deployments** → senaste driftsättningen från `main` → **Redeploy** (eller **Create Deployment** med grenen `main`). Därefter driftsätter Vercel varje sammanslagning till `main` av sig själv.
3. Kontrollera i produktion:
   - `<adress>` leder till `/logga-in`.
   - Be om en länk med din adress: mejlet kommer, länken börjar med `<adress>/auth/confirm?` och loggar in dig på `/recept`.
   - Importera ett recept (LM Studio på Macen igång), lägg det på matsedeln och öppna Lista.
   - En adress som inte finns får samma svar men inget mejl (steg 3).

## 12. Inloggad länge (Story 15.2)

Appen sätter sessionskakan till 90 dagar (`maxAge`) och förnyar sessionen i proxyn vid varje sidanrop. Kakan är `httpOnly`, `SameSite=Lax` och `secure` när `SITE_URL` börjar med `https://`. Åtkomsttoken gäller en timme och förnyas tyst med förnyelsetoken, som byts vid varje förnyelse. Sessionen slutar alltså gälla först när enheten legat oanvänd längre än Supabase tillåter. Lokalt styr `supabase/config.toml` det (`jwt_expiry = 3600`, `refresh_token_reuse_interval = 60`, `[auth.sessions] inactivity_timeout = "2160h"`).

**Authentication → Sessions** i molnprojektet (Pro-plan krävs för tids- och inaktivitetsgränserna; på gratisplanen går förnyelsetoken aldrig ut, vilket också ger över 90 dagar):

- **Time-box user sessions:** av (ingen tidsgräns).
- **Inactivity timeout:** 90 dagar (`2160h`) eller längre.
- **Detect and revoke potentially compromised refresh tokens:** på.
- **Refresh token reuse interval** (Authentication → Sign In / Providers eller *JWT Settings*): 60 sekunder, så att två samtidiga sidanrop som förnyar samma token inte loggar ut dig.
- **JWT expiry:** 3600 sekunder (standard).

Ändra inget i molnet utan att Pontus godkänner (AD-23). **Kontroll:** logga in på telefonen, vänta över en timme och öppna appen: du är fortfarande inloggad. Logga ut: kakorna `sb-…-auth-token` försvinner och `/logga-in` visas.

## 13. Siri och genvägar (Story 17.9)

Genvägen "Livskoll" på iPhone anropar `POST <adress>/api/snabb` med en personlig nyckel (Inställningar → Siri och genvägar). **Det fungerar först när appen ligger i molnet:** en telefon når inte `localhost`, så lokalt går bara att pröva från datorn (`curl -X POST http://localhost:3100/api/snabb -H "Authorization: Bearer <nyckel>" -H "Content-Type: application/json" -d '{"text":"mjölk och ägg"}'`). Nyckeln sparas bara som sha256-hash; en förlorad nyckel kan inte läsas upp, utan återkallas och ersätts med en ny. Migreringen `20261101200000_api_key_quick_add.sql` följer med `supabase db push` (steg 6), och inga nya miljövariabler behövs. Genvägen på hemskärmen (`/lista/lagg-till`) kräver inget av detta.
