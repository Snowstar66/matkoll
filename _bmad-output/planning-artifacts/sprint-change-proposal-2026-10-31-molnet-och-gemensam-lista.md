# Ändringsförslag: Molnet och gemensam lista (Epic 17)

Datum: 2026-10-31 · Status: **godkänd 2026-10-31** (17.3 och 17.4 väntar på Pontus "nu går vi till Vercel")

## Varför

Matkoll körs i dag på Pontus dator. Målet är att familjen planerar och handlar ihop i Matkoll (samma inloggning per hushåll), att appen fungerar utan Pontus dator, och att upp till fem vänhushåll kan betatesta med egna inloggningar utan att någon data blandas mellan hushållen.

Matkoll ersätter då To Do som inköpslista. To Do-integrationen parkeras: med delad inloggning finns inget att synka.

## Beslut som redan är fattade (2026-10-31)

| Fråga | Beslut |
|---|---|
| Hushåll | Ett konto per hushåll, familjen delar inloggningen. Ingen hushållsmodell med flera användare. |
| Drift | Vercel (gratisnivån, icke-kommersiell beta) + Supabase i molnet (gratisnivån, EU-region). |
| Inloggning | Enkel: e-post och lösenord, sessioner som håller länge. Ingen supersäkerhet, men bara inbjudna adresser. |
| AI | Ska gå lätt att byta leverantör och modell. Kostnaden ska synas. |
| Webb | Appen ska fungera i datorns webbläsare lika bra som installerad på telefonen. |

## Vad isoleringen vilar på (kontrollerat 2026-10-31)

- Alla 20 tabeller har `user_id` och radskydd (RLS) påslaget.
- Koden använder aldrig databasens adminnyckel (service role).
- Ingen delad cache (`"use cache"`) som kan blanda användare.
- Ingredienskatalogen är per konto, så hushållen ser aldrig varandras.

Story 17.1 gör detta till ett automatiskt test i CI så att det inte kan försämras.

## AI-kostnad, uppskattning

Viktigt: en privat Claude- eller ChatGPT-prenumeration (Pro/Plus) **ingår inte** i API-användning. API:t betalas separat med förbetalda krediter (Anthropic Console eller OpenAI Platform), t.ex. 50–100 kr att börja med.

Priser per miljon tokens (Anthropic, 2026-10): Claude Haiku 5.5 $0,10 in / $0,50 ut · Claude Sonnet 5.5 $2 / $10. Räknat med ca 10 kr per dollar och en marginal för modellens tänkande:

| Anrop | Ungefär storlek | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|---|
| Receptimport från länk | 10k in, 3k ut | ca 0,03 kr | ca 0,50 kr |
| Fotoanalys av lager | 4k in (bild), 2k ut | ca 0,01 kr | ca 0,30 kr |
| Matförslag | 6k in, 3k ut | ca 0,02 kr | ca 0,40 kr |

Ett aktivt hushåll (20 importer, 10 foton, 30 förslag i månaden) kostar då **ca 1–2 kr/månad med Haiku** eller **ca 25 kr/månad med Sonnet**. Förslag: börja med Haiku för allt och byt per uppgift om kvaliteten inte räcker; Story 17.6 visar den verkliga kostnaden så att det går att jämföra. OpenAI:s priser räknas in om du väljer den leverantören.

## Varukorgen (Epic 7)

Exporten till ICA fungerar som i dag från valfri dator med Claude in Chrome; servern behöver inte vara Pontus dator för det. Från telefonen går det att kopiera listan, men att fylla ICA:s varukorg automatiskt kräver fortfarande en dator. ICA har inget öppet API, så det lämnas som det är tills vidare.

## Stories i föreslagen ordning

**17.1 Isoleringstest mellan hushåll.** Två testkonton; för varje tabell och för bildlagringen försöker konto B läsa, ändra och ta bort konto A:s rader. Allt ska nekas. Körs i CI. En ny tabell utan test får testet att fallera.

**17.2 Enkel inloggning med lösenord.** E-post och lösenord, sessionen håller tills man loggar ut, "Glömt lösenord" via e-post. Bara adresser i inbjudningslistan kan skapa konto. Första gången visas en kort rad om att Pontus som driftansvarig tekniskt kan se datan. *(auth – granskare)*

**17.3 Molnmiljön.** Supabase-projekt i EU, Vercel-projekt, e-post för inloggningsmejl, miljövariabler, migreringar som körs från CI, veckovis säkerhetskopia av databasen (gratisnivån saknar egen backup). Appen verifieras på telefon och i datorns webbläsare. *(Pontus behöver skapa kontona; jag skriver en steg-för-steg-guide.)*

**17.4 Flytta din data till molnet.** Ett skript som för över dina recept, lager, matsedlar och listor från den lokala databasen till ditt molnkonto. Körs en gång; därefter kan datorn stängas av. *(granskare)*

**17.5 AI som går att byta.** Leverantör och modell väljs per uppgift (import, foto, förslag) i miljövariabler: Anthropic, OpenAI eller din LM Studio via Cloudflare-tunneln. Ett byte kräver ingen kodändring.

**17.6 AI-kostnad synlig.** Varje AI-jobb sparar modell och antal tokens. I Inställningar: "AI den här månaden: 34 anrop · ca 1,20 kr". *(migrering – granskare)*

**17.7 Live-inköpslista.** När någon bockar av, lägger till eller ändrar en vara syns det hos alla inom ett par sekunder (Supabase Realtime, som respekterar radskyddet). Två personer kan handla samtidigt.

**17.8 Handla med dålig täckning.** Avbockningar utan nät sparas på telefonen och skickas när nätet kommer tillbaka; listan visar att den är offline.

**17.9 Lägg till snabbt och med Siri.** Genväg från hemskärmen direkt till "Lägg till egen vara". En iOS-genväg ("Hej Siri, Matkoll" → "mjölk och ägg") som skickar till ett eget API med en personlig nyckel från Inställningar; texten delas på "och" och kommatecken, utan AI. *(ny nyckel – granskare)*

**17.10 Egna varor ligger kvar tills de är köpta,** oberoende av vilken vecka som är vald.

## Öppna frågor till Pontus

1. Godkänner du ordningen och omfånget? Är något onödigt (t.ex. 17.8) eller saknas något?
2. Har du en egen domän du vill använda, eller räcker en gratis `*.vercel.app`-adress i betan?
