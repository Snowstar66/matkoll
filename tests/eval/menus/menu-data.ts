// Ground truth for the synthetic test menus of `pnpm eval:menu` (tests/eval/menu-read.eval.ts).
// `generate.ts` renders each menu to an image and writes <id>.json with the truth.
// Allergens in the truth are only those that follow from the dish name or the printed description.

export type Group = "forratt" | "varmratt" | "efterratt" | "drycker" | "ovrigt";
export type Category = "kott" | "fisk" | "skaldjur" | "vegetariskt" | "veganskt" | null;
export type Allergen = "gluten" | "laktos" | "notter" | "skaldjur" | "agg" | "fisk" | "soja" | "sesam";

export type TruthDish = {
  name: string;
  desc?: string;
  price: number | null;
  currency: string;
  group: Group;
  category: Category;
  allergens: Allergen[];
  /** Swedish keywords: the Swedish explanation should contain at least one of them. */
  keywords: string[];
};

export type Style = {
  font: string;
  headingFont: string;
  bg: string;
  fg: string;
  accent: string;
  columns: 1 | 2;
  priceMode: "inline" | "column" | "small";
  width: number;
  fontSize: number;
  texture?: "chalk" | "paper";
  degrade?: {
    rotate?: number;
    blur?: number;
    contrast?: number;
    brightness?: number;
    shadow?: boolean;
    perspective?: boolean;
    jpegQuality?: number;
  };
};

export type MenuSpec = {
  id: string;
  language: "es" | "en" | "sv";
  restaurant: string;
  currency: string;
  note?: string;
  style: Style;
  sections: { title: string; items: TruthDish[] }[];
};

const dish = (
  name: string,
  desc: string | undefined,
  price: number | null,
  group: Group,
  category: Category,
  allergens: Allergen[],
  keywords: string[],
  currency = "",
): TruthDish => ({ name, desc, price, currency, group, category, allergens, keywords });

const withCurrency = (spec: MenuSpec): MenuSpec => ({
  ...spec,
  sections: spec.sections.map((s) => ({
    ...s,
    items: s.items.map((i) => ({ ...i, currency: i.currency || spec.currency })),
  })),
});

const es1: MenuSpec = {
  id: "es1-tapas",
  language: "es",
  restaurant: "Bar La Esquina",
  currency: "EUR",
  style: { font: "Georgia, serif", headingFont: "Didot, serif", bg: "#fbf6ea", fg: "#2b2118", accent: "#9b2c1d", columns: 2, priceMode: "inline", width: 1200, fontSize: 21, texture: "paper" },
  sections: [
    { title: "Tapas", items: [
      dish("Patatas bravas", "Patatas fritas con salsa brava picante y alioli", 5.5, "forratt", "vegetariskt", ["agg"], ["potatis"]),
      dish("Gambas al ajillo", "Gambas salteadas con ajo, guindilla y aceite de oliva", 11.9, "forratt", "skaldjur", ["skaldjur"], ["räk", "vitlök"]),
      dish("Croquetas de jamón", "Croquetas caseras de jamón ibérico y bechamel", 8, "forratt", "kott", ["gluten", "laktos", "agg"], ["kroketter", "skinka"]),
      dish("Boquerones en vinagre", "Anchoas frescas marinadas en vinagre y ajo", 7.5, "forratt", "fisk", ["fisk"], ["ansjovis", "sardell"]),
      dish("Tortilla española", "Tortilla de patata y cebolla", 6.5, "forratt", "vegetariskt", ["agg"], ["omelett", "potatis"]),
      dish("Pimientos de Padrón", "Pimientos fritos con sal gorda", 7, "forratt", "veganskt", [], ["paprik", "peppar", "chili"]),
    ] },
    { title: "Raciones", items: [
      dish("Pulpo a la gallega", "Pulpo cocido con pimentón, aceite de oliva y sal gorda", 16.5, "varmratt", "skaldjur", ["skaldjur"], ["bläckfisk", "bläckfisken"]),
      dish("Calamares a la romana", "Anillas de calamar rebozadas con limón", 12, "varmratt", "skaldjur", ["gluten", "skaldjur", "agg"], ["bläckfisk", "calamari", "bläckfiskringar"]),
      dish("Solomillo al Cabrales", "Solomillo de ternera con salsa de queso Cabrales", 19.5, "varmratt", "kott", ["laktos"], ["oxfilé", "kalvfilé", "filé"]),
    ] },
    { title: "Postres", items: [
      dish("Tarta de Santiago", "Tarta gallega de almendra", 6, "efterratt", "vegetariskt", ["notter", "agg"], ["mandel"]),
      dish("Crema catalana", "Crema de vainilla con azúcar caramelizado", 5.5, "efterratt", "vegetariskt", ["laktos", "agg"], ["kräm", "vanilj"]),
    ] },
    { title: "Bebidas", items: [
      dish("Caña de cerveza", undefined, 2.8, "drycker", null, ["gluten"], ["öl"]),
      dish("Copa de vino tinto Rioja", undefined, 4.5, "drycker", null, [], ["rött vin", "vin"]),
      dish("Copa de vino blanco Albariño", undefined, 4.8, "drycker", null, [], ["vitt vin", "vin"]),
      dish("Jarra de sangría", undefined, 14, "drycker", null, [], ["sangria", "vin"]),
    ] },
  ],
};

const es2: MenuSpec = {
  id: "es2-menu-del-dia",
  language: "es",
  restaurant: "Mesón O Pulpeiro",
  currency: "EUR",
  note: "Menú del día 14,50 € · primero, segundo, postre y bebida",
  style: { font: "Georgia, serif", headingFont: "Georgia, serif", bg: "#16181d", fg: "#f1e8d4", accent: "#e0b050", columns: 1, priceMode: "column", width: 1100, fontSize: 22 },
  sections: [
    { title: "Menú del día", items: [
      dish("Menú del día", "Primero, segundo, postre y bebida incluidos", 14.5, "ovrigt", null, [], ["meny", "lunch", "dagens"]),
      dish("Ensalada mixta", "Primero", null, "forratt", "veganskt", [], ["sallad"]),
      dish("Lentejas estofadas", "Primero", null, "forratt", "vegetariskt", [], ["linser"]),
      dish("Merluza a la plancha", "Segundo", null, "varmratt", "fisk", ["fisk"], ["kummel", "fisk", "gädda"]),
      dish("Chuletas de cerdo", "Segundo", null, "varmratt", "kott", [], ["fläsk", "kotlett"]),
      dish("Flan casero", "Postre", null, "efterratt", "vegetariskt", ["agg", "laktos"], ["pudding", "kräm", "karamell", "créme"]),
    ] },
    { title: "A la carta", items: [
      dish("Pulpo á feira", "Pulpo con patatas cachelos y pimentón", 17, "varmratt", "skaldjur", ["skaldjur"], ["bläckfisk"]),
      dish("Empanada gallega de atún", undefined, 9.5, "forratt", "fisk", ["gluten", "fisk"], ["pirog", "tonfisk", "paj"]),
      dish("Zamburiñas a la plancha", undefined, 13, "forratt", "skaldjur", ["skaldjur"], ["pilgrimsmussla", "mussla", "kammussla"]),
      dish("Solomillo de cerdo ibérico", "Con salsa de pimienta verde", 18, "varmratt", "kott", ["laktos"], ["fläskfilé", "fläsk", "filé"]),
      dish("Queso con membrillo", undefined, 6, "efterratt", "vegetariskt", ["laktos"], ["ost", "kvitten"]),
    ] },
    { title: "Bebidas", items: [
      dish("Cerveza Estrella Galicia", "Caña", 2.5, "drycker", null, ["gluten"], ["öl"]),
      dish("Vino de la casa", "Copa", 3.2, "drycker", null, [], ["vin"]),
      dish("Ribeiro blanco", "Copa", 4, "drycker", null, [], ["vin", "vitt"]),
      dish("Agua con gas", undefined, 2, "drycker", null, [], ["vatten", "kolsyrat"]),
    ] },
  ],
};

const es3: MenuSpec = {
  id: "es3-pizarra",
  language: "es",
  restaurant: "Casa Pepe",
  currency: "EUR",
  style: { font: "Chalkboard, 'Chalkboard SE', sans-serif", headingFont: "Chalkboard, sans-serif", bg: "#26302b", fg: "#eeeee6", accent: "#f2d36b", columns: 1, priceMode: "inline", width: 1000, fontSize: 26, texture: "chalk", degrade: { rotate: 4, blur: 1.1, contrast: 0.85, shadow: true } },
  sections: [
    { title: "Hoy", items: [
      dish("Paella valenciana", "para 2 personas", 22, "varmratt", "kott", [], ["paella", "ris"]),
      dish("Gazpacho andaluz", undefined, 5.5, "forratt", "veganskt", [], ["kall soppa", "tomat"]),
      dish("Jamón ibérico", "ración", 18, "forratt", "kott", [], ["skinka"]),
      dish("Chipirones fritos", undefined, 11, "forratt", "skaldjur", ["gluten", "skaldjur"], ["bläckfisk", "bläckfiskar"]),
      dish("Rabo de toro", "guisado al vino tinto", 16, "varmratt", "kott", [], ["oxsvans"]),
      dish("Bacalao al pil pil", undefined, 17, "varmratt", "fisk", ["fisk"], ["torsk", "kabeljo", "salttorsk"]),
      dish("Arroz con leche", undefined, 5, "efterratt", "vegetariskt", ["laktos"], ["risgrynsgröt", "ris", "mjölk"]),
      dish("Cerveza", "caña", 2.6, "drycker", null, ["gluten"], ["öl"]),
      dish("Tinto de verano", undefined, 3.5, "drycker", null, [], ["vin", "läsk"]),
    ] },
  ],
};

const en1: MenuSpec = {
  id: "en1-gilded-pig",
  language: "en",
  restaurant: "The Gilded Pig",
  currency: "GBP",
  style: { font: "Georgia, serif", headingFont: "Didot, serif", bg: "#f4efe6", fg: "#222", accent: "#7a1f2b", columns: 2, priceMode: "small", width: 1200, fontSize: 20, texture: "paper" },
  sections: [
    { title: "To Start", items: [
      dish("Scotch egg", "Hen's egg, black pudding, piccalilli", 8, "forratt", "kott", ["gluten", "agg"], ["ägg", "blodpudding", "fläsk"]),
      dish("Soup of the day", "Ask your server, with sourdough and cultured butter", 7, "forratt", null, ["gluten", "laktos"], ["soppa", "dagens"]),
      dish("Potted shrimp", "Brown shrimp, mace butter, toast", 11, "forratt", "skaldjur", ["skaldjur", "laktos", "gluten"], ["räkor", "smör"]),
      dish("Burrata", "Heritage tomato, basil oil, focaccia", 10.5, "forratt", "vegetariskt", ["laktos", "gluten"], ["ost", "mozzarella", "tomat"]),
    ] },
    { title: "Mains", items: [
      dish("Market fish", "Daily catch, brown butter, capers, samphire", 26, "varmratt", "fisk", ["fisk", "laktos"], ["fisk", "dagens"]),
      dish("Chef's special", "See the board", 24, "varmratt", null, [], ["kock", "kökschef", "specialitet", "dagens", "dagsrätt"]),
      dish("Bangers & mash", "Cumberland sausage, creamed potato, onion gravy", 17, "varmratt", "kott", ["laktos", "gluten"], ["korv", "potatismos"]),
      dish("Sunday roast", "Rump of beef, Yorkshire pudding, roast roots, jus", 23, "varmratt", "kott", ["gluten", "agg", "laktos"], ["rostbiff", "oxkött", "nötkött", "stek"]),
      dish("Wild mushroom wellington", "Puff pastry, chestnut, spinach, red wine gravy", 19, "varmratt", "vegetariskt", ["gluten", "laktos"], ["svamp", "smördeg"]),
      dish("Fish & chips", "Beer batter haddock, mushy peas, tartare", 18.5, "varmratt", "fisk", ["fisk", "gluten", "agg"], ["kolja", "pommes", "friterad", "fisk"]),
    ] },
    { title: "Afters", items: [
      dish("Sticky toffee pudding", "Date sponge, toffee sauce, clotted cream", 8.5, "efterratt", "vegetariskt", ["gluten", "laktos", "agg"], ["dadel", "toffee", "kaka", "pudding"]),
      dish("Eton mess", "Strawberries, meringue, whipped cream", 8, "efterratt", "vegetariskt", ["agg", "laktos"], ["jordgubb", "maräng"]),
    ] },
    { title: "Drinks", items: [
      dish("Pint of ale", undefined, 5.8, "drycker", null, ["gluten"], ["öl"]),
      dish("Glass of house red", "175ml", 6.5, "drycker", null, [], ["rött vin", "vin"]),
    ] },
  ],
};

const en2: MenuSpec = {
  id: "en2-harbour",
  language: "en",
  restaurant: "Harbour & Co.",
  currency: "USD",
  style: { font: "'Helvetica Neue', Arial, sans-serif", headingFont: "Didot, serif", bg: "#12202b", fg: "#cfd8dc", accent: "#8fb7c9", columns: 1, priceMode: "column", width: 1100, fontSize: 21, degrade: { contrast: 0.55, brightness: 0.8, shadow: true, jpegQuality: 35 } },
  sections: [
    { title: "Raw & Small", items: [
      dish("Oysters on the half shell", "Mignonette, lemon, horseradish (six)", 21, "forratt", "skaldjur", ["skaldjur"], ["ostron"]),
      dish("Tuna crudo", "Yuzu kosho, radish, sesame, ponzu", 17, "forratt", "fisk", ["fisk", "sesam", "soja"], ["tonfisk", "rå"]),
      dish("Crispy brussels", "Chili honey, pecorino, almonds", 13, "forratt", "vegetariskt", ["laktos", "notter"], ["brysselkål"]),
      dish("Clam chowder", "Littleneck clams, smoked bacon, oyster crackers", 14, "forratt", "skaldjur", ["skaldjur", "laktos", "gluten"], ["musslor", "soppa", "mussel"]),
    ] },
    { title: "From the Pass", items: [
      dish("Market fish", "Seasonal, ask your server", 36, "varmratt", "fisk", ["fisk"], ["fisk", "dagens", "säsong"]),
      dish("Lobster roll", "Brioche, drawn butter, chives", 34, "varmratt", "skaldjur", ["skaldjur", "gluten", "laktos", "agg"], ["hummer"]),
      dish("Dry-aged strip", "12 oz, bone marrow butter, frites", 52, "varmratt", "kott", ["laktos"], ["entrecote", "biff", "nötkött", "ryggbiff"]),
      dish("Chef's special", "Ask about tonight's special", 29, "varmratt", null, [], ["kock", "kökschef", "dagens", "dagsrätt", "specialitet"]),
      dish("Mushroom risotto", "Carnaroli, porcini, parmesan", 25, "varmratt", "vegetariskt", ["laktos"], ["risotto", "svamp"]),
    ] },
    { title: "Sweet", items: [
      dish("Key lime pie", "Graham crust, meringue", 11, "efterratt", "vegetariskt", ["gluten", "agg", "laktos"], ["lime", "paj"]),
      dish("Affogato", "Vanilla gelato, espresso", 9, "efterratt", "vegetariskt", ["laktos"], ["glass", "espresso", "kaffe"]),
    ] },
    { title: "Drinks", items: [
      dish("Draft IPA", undefined, 8, "drycker", null, ["gluten"], ["öl"]),
      dish("Old Fashioned", "Bourbon, bitters, orange", 16, "drycker", null, [], ["cocktail", "bourbon", "drink"]),
    ] },
  ],
};

const en3: MenuSpec = {
  id: "en3-blue-door",
  language: "en",
  restaurant: "Blue Door Diner",
  currency: "USD",
  style: { font: "'Courier New', monospace", headingFont: "'Snell Roundhand', cursive", bg: "#fff8e1", fg: "#1d2a44", accent: "#c0392b", columns: 2, priceMode: "inline", width: 1200, fontSize: 21, texture: "paper", degrade: { rotate: -5, perspective: true, blur: 0.7, shadow: true, jpegQuality: 55 } },
  sections: [
    { title: "Breakfast all day", items: [
      dish("Two eggs any style", "Hash browns, toast, bacon or sausage", 11.5, "varmratt", "kott", ["agg", "gluten"], ["ägg", "bacon", "korv"]),
      dish("Buttermilk pancakes", "Maple syrup, whipped butter", 10, "varmratt", "vegetariskt", ["gluten", "agg", "laktos"], ["pannkakor", "lönnsirap"]),
      dish("Veggie scramble", "Spinach, peppers, feta", 12, "varmratt", "vegetariskt", ["agg", "laktos"], ["äggröra", "spenat", "feta"]),
    ] },
    { title: "Sandwiches & Plates", items: [
      dish("The Reuben", "Corned beef, kraut, swiss, rye, 1000 island", 15, "varmratt", "kott", ["gluten", "laktos", "agg"], ["nötkött", "surkål", "rågbröd", "sandwich", "macka"]),
      dish("Patty melt", "Griddled onions, American cheese, rye", 14.5, "varmratt", "kott", ["gluten", "laktos"], ["hamburgare", "burgare", "köttbulle", "ost"]),
      dish("Fried chicken plate", "Slaw, mac & cheese, cornbread", 17, "varmratt", "kott", ["gluten", "laktos", "agg"], ["kyckling", "friterad"]),
      dish("Catfish po' boy", "Remoulade, pickles, shredded lettuce", 16, "varmratt", "fisk", ["fisk", "gluten", "agg"], ["havskatt", "fisk", "sandwich", "macka"]),
      dish("Garden salad", "Greens, cucumber, tomato, house vinaigrette", 9, "forratt", "veganskt", [], ["sallad"]),
    ] },
    { title: "Sweets & Shakes", items: [
      dish("Apple pie à la mode", undefined, 7.5, "efterratt", "vegetariskt", ["gluten", "laktos"], ["äppelpaj", "paj", "glass"]),
      dish("Chocolate malt shake", undefined, 8, "efterratt", "vegetariskt", ["laktos", "gluten"], ["milkshake", "shake", "choklad"]),
      dish("Bottomless coffee", undefined, 3.5, "drycker", null, [], ["kaffe"]),
      dish("Root beer float", undefined, 6.5, "drycker", null, ["laktos"], ["root beer", "läsk", "glass"]),
    ] },
  ],
};

const sv1: MenuSpec = {
  id: "sv1-lilla-torget",
  language: "sv",
  restaurant: "Bistro Lilla Torget",
  currency: "SEK",
  note: "Dagens lunch 135 kr · inkl. sallad, bröd, kaffe",
  style: { font: "Georgia, serif", headingFont: "Georgia, serif", bg: "#ffffff", fg: "#1b1b1b", accent: "#1f5f4a", columns: 1, priceMode: "inline", width: 1000, fontSize: 22 },
  sections: [
    { title: "Dagens lunch", items: [
      dish("Måndag: Pannbiff med lök", "Stekt lök, kokt potatis, gräddsås, lingon", 135, "varmratt", "kott", ["laktos", "gluten", "agg"], ["biff", "köttfärs", "nötkött"]),
      dish("Tisdag: Ugnsbakad torsk", "Dillsås, potatis, citron", 135, "varmratt", "fisk", ["fisk", "laktos"], ["torsk", "fisk"]),
      dish("Onsdag: Svamprisotto", "Karljohan, riven ost, ruccola", 125, "varmratt", "vegetariskt", ["laktos"], ["svamp", "risotto", "ris"]),
    ] },
    { title: "Á la carte", items: [
      dish("Toast Skagen", "Handskalade räkor, löjrom, dill, rostat bröd", 145, "forratt", "skaldjur", ["skaldjur", "gluten", "laktos", "agg", "fisk"], ["räk", "räkor", "löjrom"]),
      dish("Västerbottenpaj", "Med rödlök och sallad", 125, "forratt", "vegetariskt", ["gluten", "laktos", "agg"], ["ost", "paj"]),
      dish("Husets köttbullar", "Gräddsås, lingon, pressgurka, potatispuré", 185, "varmratt", "kott", ["gluten", "laktos", "agg"], ["köttbullar"]),
      dish("Raggmunk med fläsk", "Stekt fläsk, lingon", 165, "varmratt", "kott", ["gluten", "agg", "laktos"], ["potatispannkaka", "fläsk"]),
      dish("Vegetarisk linsgryta", "Röda linser, kokosmjölk, spenat, ris", 155, "varmratt", "veganskt", [], ["linser"]),
      dish("Kladdkaka", "Vispad grädde, bär", 85, "efterratt", "vegetariskt", ["gluten", "agg", "laktos"], ["chokladkaka", "choklad", "kaka"]),
    ] },
    { title: "Dryck", items: [
      dish("Folköl", undefined, 59, "drycker", null, ["gluten"], ["öl"]),
      dish("Glas husets rödvin", undefined, 98, "drycker", null, [], ["vin", "rött"]),
      dish("Kaffe", undefined, 35, "drycker", null, [], ["kaffe"]),
    ] },
  ],
};

const sv2: MenuSpec = {
  id: "sv2-vita-hjorten",
  language: "sv",
  restaurant: "Krogen Vita Hjorten",
  currency: "SEK",
  style: { font: "'Helvetica Neue', Arial, sans-serif", headingFont: "Didot, serif", bg: "#f7f3ec", fg: "#25302a", accent: "#4b6b3a", columns: 2, priceMode: "column", width: 1250, fontSize: 19, texture: "paper" },
  sections: [
    { title: "Förrätter", items: [
      dish("Gravad lax", "Hovmästarsås, rostat bröd", 135, "forratt", "fisk", ["fisk", "gluten", "agg", "laktos"], ["lax"]),
      dish("Rödbetscarpaccio", "Getost, valnötter, honung", 115, "forratt", "vegetariskt", ["laktos", "notter"], ["rödbet", "getost"]),
      dish("Svampsoppa", "Tryffelolja, krutonger", 105, "forratt", "vegetariskt", ["laktos", "gluten"], ["svamp", "soppa"]),
    ] },
    { title: "Huvudrätter", items: [
      dish("Älggryta", "Rotfrukter, rårörda lingon, potatismos", 245, "varmratt", "kott", ["laktos"], ["älg", "gryta", "vilt"]),
      dish("Rimmad lax", "Dillstuvad potatis, ärtskott", 215, "varmratt", "fisk", ["fisk", "laktos"], ["lax", "saltad"]),
      dish("Ugnsrostad blomkål", "Linspuré, hasselnötter, persilja", 195, "varmratt", "veganskt", ["notter"], ["blomkål", "hasselnöt"]),
      dish("Svamppasta", "Kantareller, parmesan, grädde", 189, "varmratt", "vegetariskt", ["gluten", "laktos", "agg"], ["pasta", "kantarell"]),
      dish("Oxfilé", "Rödvinssky, potatisgratäng, haricots verts", 325, "varmratt", "kott", ["laktos"], ["oxfilé", "nötkött"]),
      dish("Vegetarisk burgare", "Svarta bönor, avokado, brioche, pommes", 175, "varmratt", "vegetariskt", ["gluten", "agg", "laktos"], ["böna", "bönor", "burgare", "hamburgare"]),
    ] },
    { title: "Efterrätter", items: [
      dish("Äppelkaka", "Vaniljsås", 95, "efterratt", "vegetariskt", ["gluten", "laktos", "agg"], ["äpple", "kaka"]),
      dish("Glass med hjortronsylt", undefined, 85, "efterratt", "vegetariskt", ["laktos"], ["hjortron", "glass"]),
    ] },
    { title: "Drycker", items: [
      dish("Fatöl", "40 cl", 79, "drycker", null, ["gluten"], ["öl"]),
      dish("Alkoholfritt", "33 cl", 49, "drycker", null, [], ["alkoholfri", "dryck"]),
    ] },
  ],
};

const sv3: MenuSpec = {
  id: "sv3-tavlan",
  language: "sv",
  restaurant: "Café Tavlan",
  currency: "SEK",
  style: { font: "Chalkboard, 'Chalkboard SE', sans-serif", headingFont: "'Bradley Hand', cursive", bg: "#2b2f2c", fg: "#f2f0e6", accent: "#ffd37a", columns: 1, priceMode: "inline", width: 1000, fontSize: 27, texture: "chalk", degrade: { rotate: 3, blur: 0.9, contrast: 0.8, shadow: true, jpegQuality: 40 } },
  sections: [
    { title: "Idag", items: [
      dish("Dagens soppa", "med bröd", 99, "forratt", "vegetariskt", ["gluten", "laktos"], ["soppa", "dagens"]),
      dish("Fiskgratäng", undefined, 149, "varmratt", "fisk", ["fisk", "laktos", "gluten"], ["fisk", "gratäng"]),
      dish("Vegolasagne", undefined, 139, "varmratt", "vegetariskt", ["gluten", "laktos", "agg"], ["lasagne"]),
      dish("Kycklingwok", "ris, grönsaker, soja", 145, "varmratt", "kott", ["soja"], ["kyckling", "wok"]),
      dish("Räksmörgås", undefined, 129, "varmratt", "skaldjur", ["skaldjur", "gluten", "agg", "laktos"], ["räk", "smörgås", "macka"]),
      dish("Kanelbulle", undefined, 38, "efterratt", "vegetariskt", ["gluten", "laktos", "agg"], ["kanel", "bulle"]),
      dish("Bryggkaffe", undefined, 32, "drycker", null, [], ["kaffe"]),
      dish("Hembakad chokladboll", "vegansk", 30, "efterratt", "veganskt", [], ["choklad", "boll"]),
    ] },
  ],
};

export const menus: MenuSpec[] = [es1, es2, es3, en1, en2, en3, sv1, sv2, sv3].map(withCurrency);
