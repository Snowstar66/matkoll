import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultMaxChars, extractRecipePage, textWithRecipeJsonLdChars } from "./extract";

// extractRecipePage on the saved pages from koket.se and tasteline.com, and on
// small pages for the rules. The saved pages' text and JSON-LD are also the
// AI mock's input for those pages (tests/fixtures/ai), so a change to the
// extraction shows up here: save the pages again with `pnpm sites:probe --save`.

const read = (path: string) => readFileSync(new URL(`../../../tests/fixtures/${path}`, import.meta.url), "utf8");

const sites = [
  { name: "koket-chow-mein", title: "Chow mein med lövbiff", line: "400 g lövbiff, tunt strimlad" },
  { name: "tasteline-bakad-fetaost", title: "Bakad fetaost med rostad potatis", line: "fetaost" },
];

describe.each(sites)("the saved page $name", ({ name, title, line }) => {
  const page = extractRecipePage(read(`sites/${name}.html`));

  it("has Recipe JSON-LD with ingredients and steps", () => {
    const recipe = JSON.parse(page.jsonLd ?? "null");
    expect(recipe["@type"]).toBe("Recipe");
    expect(recipe.name).toBe(title);
    expect(recipe.recipeIngredient.length).toBeGreaterThan(5);
    expect(recipe.recipeInstructions.length).toBeGreaterThan(2);
    // Reviews, ratings and people only take up room.
    expect(recipe).not.toHaveProperty("aggregateRating");
    expect(recipe).not.toHaveProperty("author");
  });

  it("has readable text with the recipe and without code", () => {
    expect(page.text).toContain(title);
    expect(page.text).toContain(line);
    expect(page.text).not.toMatch(/function\s*\(|<script|<\/|\{\s*"@context"/);
  });

  it("has the recipe's image", () => {
    expect(page.imageUrl).toMatch(/^https:\/\//);
  });

  it("fits the AI port's limit together, with little text since the JSON-LD has ingredients and steps", () => {
    expect(page.text.length + (page.jsonLd?.length ?? 0)).toBeLessThanOrEqual(defaultMaxChars);
    expect(page.text.length).toBeLessThanOrEqual(textWithRecipeJsonLdChars);
  });

  it("is what the AI mock's case for the page holds", () => {
    expect(page.text).toBe(read(`ai/${name}.txt`));
    expect(page.jsonLd).toBe(read(`ai/${name}.jsonld.json`));
  });
});

const recipe = { "@type": "Recipe", name: "Kladdkaka", recipeIngredient: ["100 g smör"] };
const withJsonLd = (...values: unknown[]) =>
  `<html><head>${values
    .map((value) => `<script type="application/ld+json">${typeof value === "string" ? value : JSON.stringify(value)}</script>`)
    .join("")}</head><body><p>Kladdkaka</p></body></html>`;

describe("JSON-LD", () => {
  it.each([
    ["at the top", recipe],
    ["in a list", [{ "@type": "WebSite" }, recipe]],
    ["in @graph", { "@context": "https://schema.org", "@graph": [{ "@type": "BreadcrumbList" }, recipe] }],
    ["as mainEntity", { "@type": "WebPage", mainEntity: recipe }],
    ["with several types", { ...recipe, "@type": ["Recipe", "NewsArticle"] }],
    ["with a full type URL", { ...recipe, "@type": "https://schema.org/Recipe" }],
  ])("finds the Recipe %s", (_name, value) => {
    expect(JSON.parse(extractRecipePage(withJsonLd(value)).jsonLd ?? "null")).toMatchObject({ name: "Kladdkaka" });
  });

  it("skips scripts that are not JSON and other types", () => {
    const html = withJsonLd("{ not json", { "@type": "Organization", name: "Köket" }, recipe);
    expect(JSON.parse(extractRecipePage(html).jsonLd ?? "null").name).toBe("Kladdkaka");
  });

  it("is null without a Recipe", () => {
    expect(extractRecipePage(withJsonLd({ "@type": "Article" })).jsonLd).toBeNull();
    expect(extractRecipePage("<p>Hej</p>").jsonLd).toBeNull();
  });

  it("does not take a Recipe from another kind of script", () => {
    const html = `<script type="application/json">${JSON.stringify(recipe)}</script><p>x</p>`;
    expect(extractRecipePage(html).jsonLd).toBeNull();
  });

  it.each([
    ["a string", "https://img.example/a.jpg", "https://img.example/a.jpg"],
    ["a list", ["http://img.example/a.jpg", "https://img.example/b.jpg"], "https://img.example/b.jpg"],
    ["an ImageObject", { "@type": "ImageObject", url: "https://img.example/c.jpg" }, "https://img.example/c.jpg"],
    [
      "an ImageObject with an http url and an https contentUrl",
      { "@type": "ImageObject", url: "http://img.example/d.jpg", contentUrl: "https://img.example/d.jpg" },
      "https://img.example/d.jpg",
    ],
    ["only http", "http://img.example/a.jpg", null],
    ["not an address", "bild.jpg", null],
    ["an address over 2 048 characters", `https://img.example/${"a".repeat(2_040)}.jpg`, null],
  ])("reads the image from %s", (_name, image, expected) => {
    expect(extractRecipePage(withJsonLd({ ...recipe, image })).imageUrl).toBe(expected);
  });

  it("follows an @id reference to an ImageObject in @graph", () => {
    const graph = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "ImageObject", "@id": "https://www.koket.se/#bild", url: "https://img.example/graph.jpg" },
        { ...recipe, image: { "@id": "https://www.koket.se/#bild" } },
      ],
    };
    expect(extractRecipePage(withJsonLd(graph)).imageUrl).toBe("https://img.example/graph.jpg");
  });

  it("falls back to og:image, https only", () => {
    const page = (content: string, json: unknown = recipe) =>
      withJsonLd(json).replace("<head>", `<head><meta property="og:image" content="${content}">`);
    expect(extractRecipePage(page("https://img.example/og.jpg")).imageUrl).toBe("https://img.example/og.jpg");
    expect(extractRecipePage(page("https://img.example/og.jpg", { ...recipe, image: "/relativ.jpg" })).imageUrl).toBe(
      "https://img.example/og.jpg",
    );
    expect(extractRecipePage(page("http://img.example/og.jpg")).imageUrl).toBeNull();
    expect(extractRecipePage(`<head><meta property="og:image" content="https://img.example/x.jpg"></head><p>x</p>`).imageUrl).toBe(
      "https://img.example/x.jpg",
    );
  });
});

describe("readable text", () => {
  it("leaves out page chrome, code, styling and comments", () => {
    const html = `<html><head><title>T</title><style>p{color:red}</style></head><body>
      <header>Logga in</header><nav>Meny</nav><div role="banner">Kampanj</div>
      <main><h1>Kladdkaka</h1><!-- en kommentar --><p>100 g smör<br>2 ägg</p>
      <ul><li>Smält smöret.</li><li>Rör ner äggen.</li></ul></main>
      <aside>Fler recept</aside><div role="navigation">Länkar</div><svg><text>Ikon</text></svg>
      <script>var x = 1;</script><noscript>Slå på JS</noscript>
      <footer>Om oss</footer><div role="contentinfo">Kontakt</div></body></html>`;
    expect(extractRecipePage(html).text).toBe("Kladdkaka\n100 g smör\n2 ägg\nSmält smöret.\nRör ner äggen.");
  });

  it("keeps a header, footer and form inside main or article", () => {
    const html = `<body><header>Sajtens meny</header>
      <article><header><h1>Kladdkaka</h1><p>8 bitar</p></header>
      <form><label>Portioner</label><p>100 g smör</p></form><footer>Tips: servera ljummen.</footer></article>
      <main><nav>Steg 1 · Steg 2</nav></main></body>`;
    expect(extractRecipePage(html).text).toBe(
      "Kladdkaka\n8 bitar\nPortioner\n100 g smör\nTips: servera ljummen.\nSteg 1 · Steg 2",
    );
  });

  it("keeps a form outside main, since it is not page chrome", () => {
    expect(extractRecipePage("<body><form><p>2 dl mjölk</p></form></body>").text).toBe("2 dl mjölk");
  });

  it("keeps one of two equal lines in a row and collapses whitespace", () => {
    expect(extractRecipePage("<div>Steg  1</div><div>Steg 1</div><p>  Klart\t nu </p>").text).toBe("Steg 1\nKlart nu");
  });
});

describe("the limit", () => {
  const longText = Array.from({ length: 2_000 }, (_, i) => `<p>Rad ${i} med lite text</p>`).join("");

  it("cuts the text at a line end to fit the limit", () => {
    const { text } = extractRecipePage(`<body>${longText}</body>`, 1_000);
    expect(text.length).toBeLessThanOrEqual(1_000);
    expect(text.endsWith("med lite text")).toBe(true);
  });

  it("gives the text the rest of the budget when the JSON-LD lacks the steps", () => {
    const page = extractRecipePage(withJsonLd(recipe).replace("<p>Kladdkaka</p>", longText), 10_000);
    expect(page.jsonLd).not.toBeNull();
    expect(page.text.length).toBeGreaterThan(textWithRecipeJsonLdChars);
    expect(page.text.length + (page.jsonLd?.length ?? 0)).toBeLessThanOrEqual(10_000);
  });

  it("gives the text at most 2 000 characters when the JSON-LD has ingredients and steps", () => {
    const full = { ...recipe, recipeInstructions: [{ "@type": "HowToStep", text: "Smält smöret." }] };
    const page = extractRecipePage(withJsonLd(full).replace("<p>Kladdkaka</p>", longText));
    expect(page.text.length).toBeLessThanOrEqual(textWithRecipeJsonLdChars);
    expect(page.text.length).toBeGreaterThan(textWithRecipeJsonLdChars - 100);
  });

  it("makes a long JSON-LD smaller without cutting it: noise first, then long lists, then extras", () => {
    const steps = Array.from({ length: 10 }, (_, i) => `Steg ${i}`);
    const big = {
      ...recipe,
      recipeInstructions: steps,
      review: Array.from({ length: 50 }, () => ({ reviewBody: "Gott!".repeat(20) })),
      nutrition: { calories: "400 kcal" },
      keywords: Array.from({ length: 200 }, (_, i) => `ord${i}`),
      description: "Lång text. ".repeat(100),
    };
    const roomy = JSON.parse(extractRecipePage(withJsonLd(big), 10_000).jsonLd ?? "null");
    expect(roomy).not.toHaveProperty("review");
    expect(roomy).not.toHaveProperty("nutrition");
    expect(roomy.keywords).toHaveLength(200);

    const tight = extractRecipePage(withJsonLd(big), 1_500).jsonLd ?? "null";
    expect(tight.length).toBeLessThanOrEqual(900);
    const parsed = JSON.parse(tight);
    expect(parsed.recipeInstructions).toEqual(steps);
    expect(parsed.recipeIngredient).toEqual(["100 g smör"]);
    expect(parsed.keywords).toBeUndefined();
    expect(parsed).not.toHaveProperty("description");
  });

  it("shortens other lists before dropping the extras", () => {
    const big = { ...recipe, recipeInstructions: ["Grädda."], keywords: Array.from({ length: 300 }, (_, i) => `ord${i}`) };
    const parsed = JSON.parse(extractRecipePage(withJsonLd(big), 3_000).jsonLd ?? "null");
    expect(parsed.keywords).toEqual(["ord0", "ord1", "ord2"]);
  });

  it("leaves the JSON-LD out when even the recipe itself does not fit, and gives the text the whole budget", () => {
    const huge = { ...recipe, recipeIngredient: Array.from({ length: 400 }, (_, i) => `${i} g smör`) };
    const page = extractRecipePage(withJsonLd(huge).replace("<p>Kladdkaka</p>", longText), 3_000);
    expect(page.jsonLd).toBeNull();
    expect(page.text.length).toBeGreaterThan(2_500);
  });

  it("uses the AI port's 12 000 characters by default", () => {
    expect(defaultMaxChars).toBe(12_000);
  });
});
