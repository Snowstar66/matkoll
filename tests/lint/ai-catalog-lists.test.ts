import { describe, expect, it } from "vitest";
import { LOCATIONS } from "@/features/catalog/domain/locations";
import { SECTIONS } from "@/features/catalog/domain/sections";
import { UNITS } from "@/features/catalog/domain/units";
import { thingCategories, thingConfidences } from "@/features/things/domain/thing";
import {
  catalogLocations,
  catalogSections,
  catalogUnits,
  thingCategories as portThingCategories,
  thingConfidences as portThingConfidences,
} from "@/server/ai/schemas";

// Story 12.3: the AI port never imports the catalog (AD-1), so the compact
// answer for suggestions has its own copies of the sections, places and
// units it takes in `new`. They stay the catalog's.

describe("the AI port's catalog lists", () => {
  it("are the catalog's sections, places and units, in the same order", () => {
    expect(catalogSections).toEqual(SECTIONS);
    expect(catalogLocations).toEqual(LOCATIONS);
    expect(catalogUnits).toEqual(UNITS);
  });
});

// Story 18.2: the same for the things the port lists from a photo; the
// migration's checks (thing_item_category_check) follow the module's list.
describe("the AI port's thing lists", () => {
  it("are the things module's categories and confidences, in the same order", () => {
    expect(portThingCategories).toEqual(thingCategories);
    expect(portThingConfidences).toEqual(thingConfidences);
  });
});
