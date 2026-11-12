# Startrecept (Kom igång med recept)

Ett hushåll kan **välja** färdiga vardagsrätter med bild och lägga dem i sin egen receptlista. Inget läggs till av sig självt. Funktionen ligger bakom Tillval **Startrecept** (Inställningar → Tillval, per enhet, av som standard). Skissen "Kom igång med recept" (2026-11-11) är förlagan.

## Var paketet finns

Paketet är **inte** hårdkodat och repot innehåller **inga** recept. Paketet är en lista i databasen (`starter_pack_item`) över **appägarens egna recept**. Det är tomt tills ägaren lägger in något.

Ägaren sköter det i appen, inget skript behövs:

- **Lägg till:** öppna ett av dina recept, tryck ⋯ och **Lägg i startpaketet**. Eller Inställningar → Appens ägare → **Startrecept** → *Lägg till från dina recept*.
- **Ordning och anteckning:** på samma sida flyttar du upp och ned och skriver en kort anteckning (högst 140 tecken) som visas under titeln i väljaren.
- **Ta bort:** soptunnan på sidan, eller ⋯ → **Ta bort ur startpaketet** på receptet. Kopior som hushåll redan har gjort ligger kvar hos dem.
- **Förhandsvisa:** *Förhandsvisa som nytt hushåll* visar väljaren precis som ett nytt hushåll ser den (inget tillagt, inga allergier, plats för allt). Förhandsvisningen kopierar ingenting.

Ändrar du ett recept som ligger i paketet ser hushåll som väljer det efter ändringen den nya versionen. Kopior som redan gjorts ändras inte.

Vem som är ägare avgörs av `is_app_owner()` i databasen (tabellen `app_owner`, `pnpm owner:sync`), som för Inkorg och AI-kostnad.

### Rättigheter till texter och bilder

Det är **ditt ansvar** (Pontus) att du får dela det som ligger i paketet. Egna recept och egna foton går bra. Recept och bilder från sajter som koket.se, ica.se eller tasteline.com kan vara upphovsrättsskyddade, och då ska de inte läggas i paketet. Appen kontrollerar inte det. En kopia som någon sparat från Delade recept (någon annans recept) går inte att lägga i paketet.

### Molnet

Paketet fylls i den riktiga appen (livskoll.vercel.app), inte lokalt: logga in som ägare och lägg i dina recept. Det finns ingen export eller import, och ingen `pnpm pack:export`. Migreringen körs i molnet av `cloud-migrate.yml` när PR:en mergas till `main` (eller med `supabase db push`, se `molnet.md` steg 3). Kontrollera efteråt i SQL Editor:

```sql
select count(*) from public.starter_pack_item;          -- 0 innan du lagt in något
select tgname from pg_trigger where tgname = 'recipe_starter_guard';  -- en rad
```

## Hushållets resa

1. **Erbjudandet** (Steg 1): med Tillval Startrecept på och recept kvar att välja visar en tom receptlista *Börja med några recept* med **Välj startrecept** (Importera blir en textlänk under). En lista med recept får raden *Fler recept? Välj bland startrecepten* sist. Plusknappen är oförändrad.
2. **Väljaren** (`/recept/startrecept`): rutnät med bildkort, snabbfilter (Alla, Passar alla, Vegetariskt, Fisk, Fågel, Kött, Snabbt, Pasta, Soppa, Gryta, Sallad: de som något recept har), räknaren och *Välj alla N*. Cirkeln väljer, bilden eller titeln öppnar receptet.
3. **Förhandsvisning:** stor bild, tid och portioner, etiketter, ingredienser och steg exakt som de är skrivna, och källan.
4. **Tillägg:** ett recept i taget med framsteg. *Avbryt* stannar efter receptet som kopieras nu; det som är tillagt ligger kvar.
5. **Klart:** de tillagda med soptunna och Ångra (6 s), *Visa i Recept* och *Välj fler startrecept*.

Stoppfallen har egna skärmar: *Kunde inte hämta recepten*, *Anslutningen bröts* (Fortsätt med de N sista / Behåll de M), *Receptlistan är full*, *Ni har redan alla startrecept*, *Inga startrecept än*, *Startrecept är avstängt*, och den grå knappen *Välj minst ett recept*.

## Vad en kopia är

- Ett vanligt recept i hushållet: titel, portioner, tid, källa (`source_kind`, `source_url`), bildadress, steg och ingrediensrader **kopieras exakt**. Inget skrivs om och ingen AI används. Varje rads ingrediens matchas på namn mot hushållets egen katalog, och de som saknas skapas (som när ett delat recept sparas).
- **Bilden** kopieras från ägarens lagrade bild (`recipe-images`, full och miniatyr) till hushållets egen mapp. Har paketreceptet ingen lagrad bild hämtas den från bildadressen som vid vanlig sparning. Går det inte sparas receptet ändå.
- **Markeringen:** `recipe.starter_item_id` (vilken post i paketet) och `recipe.starter_fingerprint` (en md5 av innehållet när det kopierades). Bara `save_starter_recipe` skriver dem (`recipe_starter_guard`).
- **Aldrig två gånger:** ett unikt index (hushåll, post) och ett lås per hushåll. Ett recept som finns står som *Finns redan*. Ägarens eget hushåll ser sina egna recept som tillagda.
- **Receptgränsen:** en kopia görs bara om hushållet har färre än 400 recept (`starter_recipe_household_cap()`, lika många som bildtaket i `recipe-images` rymmer). Gränsen gäller **bara startrecept**; egna recept stoppas inte.
- **Delas inte av Dela alla:** en kopia blir inte delad av hushållets *Dela alla mina recept*.

## Ta bort startrecepten

*Ta bort N orörda startrecept* (längst ned i väljaren, och på *Ni har redan alla startrecept*) tar bort hushållets kopior som är **orörda**: innehållet är som när det kopierades (samma fingeravtryck), inte favorit, inte delat och inte på någon matsedel. Recept hushållet har ändrat, och alla recept som inte är startrecept, rörs aldrig. Bilderna tas bort med Storage-API:et efteråt. Soptunnan på *Klart* använder samma regel för ett recept.

## Allergier

Väljaren håller hushållets Smak och allergier (Medlemmar) mot varje recepts ingrediensrader, som Recept gör. Ett kort visar *Kan innehålla …* i rött, förhandsvisningen alla anteckningar, och chipet **Passar alla** (bara när någon allergi slår till) döljer de recept som kan krocka. Inget döljs utan att man väljer chipet. Det är samma ordmatchning som i Recept och den kan missa; det är ingen garanti.

## Databasen (`20261112120000_starter_recipes.sql`)

Bara tillägg: tabellen `starter_pack_item`, kolumnerna `recipe.starter_item_id` och `recipe.starter_fingerprint`, en check, ett unikt index, triggern `recipe_starter_guard`, storage-policyn `recipe_images_starter_select` och funktioner. Inget befintligt ändras eller tas bort.

- `starter_pack_item`: radskydd på, ingen policy och ingen behörighet för någon klient. Bara funktionerna når den.
- Medlemmar (`my_household_id()`): `starter_pack_list()`, `get_starter_recipe(item)`, `save_starter_recipe(item, ingredient_ids, expected_version)`, `starter_image_folder(item)`, `starter_recipe_room()`. De ger bara receptet, aldrig ägarens hushåll, favoriter, anteckningar eller matsedel.
- Ägaren (`is_app_owner()`, annars 42501): `starter_pack_items()`, `starter_pack_add(recipe)`, `starter_pack_remove(item)`, `starter_pack_set_note(item, note)`, `starter_pack_move(item, step)`. Högst 60 recept i paketet.
- Hushållets kopior (security invoker, radskyddet begränsar): `starter_copies()`, `delete_untouched_starter_copies(ids)`, `starter_recipe_fingerprint(recipe)`.
- Bilder: alla inloggade medlemmar får **läsa** filerna i mappen för ett recept som ligger i paketet (`recipe_image_in_starter_pack`). Ingen annan än ägarens hushåll kan lägga till, ändra eller ta bort dem. Tas receptet ur paketet stängs läsningen igen.

Prov: `tests/integration/starter-recipes.test.ts` (ägare, två hushåll och anon), katalogen i `security-attack.test.ts` och `household-isolation.test.ts`, och `tests/e2e/starter-recipes.spec.ts` (hela resan).

## Att backa

Allt går att backa utan att något går sönder: stäng av Tillval Startrecept (per enhet), eller töm paketet på ägarsidan. Migreringen har bara tillägg; koden före den fungerar med den.
