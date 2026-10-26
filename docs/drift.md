# Matkoll – drift i molnet

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

**Kontroll:** **Project Settings → General** visar regionen `eu-north-1`.

## 3. Registrering avstängd

**Authentication → Sign In / Providers:** stäng av **Allow new users to sign up**. E-post med engångslänk ska vara på. Lokalt motsvaras det av `enable_signup = false` i `supabase/config.toml` (AD-3); användare skapas bara av `pnpm users:sync`.

**Kontroll:** efter steg 11, be om en länk på `<adress>/logga-in` med en adress som inte finns. Sidan svarar som vanligt, men inget mejl kommer och ingen användare skapas under **Authentication → Users**.

## 4. Site URL och redirect-URL

**Authentication → URL Configuration:**

- **Site URL:** `<adress>`
- **Redirect URLs:** lägg till `<adress>/auth/confirm**`

Länken i mejlet går till `<adress>/auth/confirm?next=…` (appen bygger den från `SITE_URL`). Stjärnorna behövs för `?next=`. Om adressen inte står på listan skickar Supabase i stället Site URL, och då fungerar inte inloggningen.

**Kontroll:** i steg 11 ska länken i mejlet börja med `<adress>/auth/confirm?`.

## 5. E-postmallen och SMTP

**Authentication → Emails → Templates → Magic Link:**

- **Subject:** `Din inloggningslänk till Matkoll`
- **Body:** innehållet i `supabase/templates/magic-link.html`, oförändrat (samma som lokalt, se `[auth.email.template.magic_link]` i `supabase/config.toml`).

Supabase inbyggda e-post skickar bara till projektets teammedlemmar och bara några mejl i timmen. Det räcker så länge bara du loggar in, med samma adress som ditt Supabase-konto. Ska fler logga in, eller tar gränsen slut: lägg in egen SMTP under **Authentication → Emails → SMTP Settings** (till exempel Resend eller Postmark, med avsändaradress på en egen domän).

**Kontroll:** mejlet i steg 11 har ämnet och texten från mallen ("Logga in på Matkoll").

## 6. Schemat: `supabase link` och `supabase db push`

Schemat ändras bara med migrationer (AD-5). Molnet får dem från din terminal, aldrig från CI:

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

Skriptet skriver varje rad i `pantry_item` (`id`, användare, katalogvara, plats, mängd och enhet, sorterade på `id`) och antalet rader. Efter migreringen kontrollerar det också eftervillkoren: varje vara ligger på ett ställe som tillhör samma användare, varje användare har exakt ett valt ställe, och varje sparad rad för "Ångra" har sitt ställe. Eftervillkoren skriver inget till filen, bara `NOTICE: pantry-site-check: the postconditions hold`, och ett brutet villkor stoppar skriptet med ett fel.

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

Kontrollerat 2026-10-26 med samma CLI-version mot den lokala stacken: `supabase db dump --dry-run`, verkliga dumpar och en återläsning i en separat, tillfällig lokal stack.

- `schema.sql` (`supabase db dump`): det egna schemat, främst `public` med tabeller, funktioner, RLS-policyer och rättigheter. `auth`, `storage` och andra scheman som Supabase sköter tas inte med; ett nytt projekt har dem redan, och Matkoll har inga egna objekt där.
- `data.sql` (`supabase db dump --data-only`): data i alla scheman utom Supabase interna, alltså även `auth.users` och `auth.identities`, som alla rader refererar via `user_id`. `auth` behöver inte läggas till. Utelämnas gör:
  - `storage.buckets_vectors` och `storage.vector_indexes`, eftersom rollen `postgres` inte får skriva till dem vid återläsning (Matkoll lagrar inga filer);
  - inloggningarnas tillfälliga och känsliga data: `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_amr_claims` (hör till sessionerna), `auth.one_time_tokens`, `auth.flow_state` och `auth.audit_log_entries`. De behövs inte för en återställning; efteråt loggar alla in på nytt.

  Migrationshistoriken (`supabase_migrations`) ingår inte.
- `manifest.txt`: commiten som körningen gjordes från, CLI-versionen och de migrationer som är körda i molnet (från `supabase_migrations.schema_migrations`).
- `counts.txt`: antal rader i `auth.users` och i varje tabell i `public`, från `scripts/backup-counts.sql`, räknade strax före dumpen.
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
