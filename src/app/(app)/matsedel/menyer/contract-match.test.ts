import { expectTypeOf, it } from "vitest";
import type * as Server from "@/features/restaurant-agent/server";
import type * as Ui from "@/features/restaurant-agent/ui";

// The UI port must stay structurally identical to the Server Action's contract.
it("ui port equals the action contract", () => {
  expectTypeOf<Ui.FindInput>().toEqualTypeOf<Server.FindInput>();
  expectTypeOf<Ui.FindResult>().toEqualTypeOf<Server.FindResult>();
  expectTypeOf<Ui.SuggestionView>().toEqualTypeOf<Server.SuggestionView>();
  expectTypeOf<Ui.MenuLinkResult>().toEqualTypeOf<Server.MenuLinkResult>();
  expectTypeOf<Ui.LocationQuery>().toEqualTypeOf<Server.LocationQuery>();
});
