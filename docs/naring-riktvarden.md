# Riktvärden i arket Näring

Staplarna i arket Näring jämförs med ett riktvärde för en måltid, aldrig ett krav.

Källa: Nordiska näringsrekommendationer 2023 (NNR2023), Livsmedelsverkets sammanfattning "Referensvärden för energi och näringsämnen" (livsmedelsverket.se, Referensvärden i NNR). Vuxna, intervall i energiprocent: protein 10-20 E% (planering 15), fett 25-40 E% (planering 32-33), kolhydrater 45-60 E% (planering 52-53), kostfiber minst 3 g/MJ, vilket är 25 g/dag för kvinnor och 35 g/dag för män.

En måltid räknas som en tredjedel av en dag på 2000 kcal, 667 kcal: protein 25 g, fett 24 g, kolhydrater 88 g, fiber 10 g (mitt emellan 25 och 35 g per dag, delat på tre). Värdena finns i `src/features/nutrition/domain/reference.ts`.

Verifierat: intervallen och fiberkraven mot Livsmedelsverkets sida (via sökträff, själva sidan gick inte att hämta direkt). Valet att dela dagen i tre och ta mittpunkter är vårt, inte en officiell siffra; texten i appen säger "ungefärligt".

Meningen på kortet (`domain/sentence.ts`) beskriver bara energins fördelning, grönsaker på tallriken och fiber. Vi har inga data om socker, mättat fett eller salt, så meningen säger inget om dem.
