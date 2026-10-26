Shared UI building blocks used by more than one feature module; no data access and no feature imports (AD-1, AD-17).

Each follows the same-named entry under Components in DESIGN.md (look) and Component Patterns in EXPERIENCE.md (behaviour). Colours, sizes and corners come only from the tokens in `src/app/globals.css` through Tailwind classes; never hex values. The README at the project root lists the blocks.

## Epic 11 building blocks (Story 11.1)

The new look in Lagersaldo, Inköpslista, Recept and Matsedel (Stories 11.3–11.5) is built from these. The category of an item comes from `displayCategory(section, name)` in `@/features/catalog`; sort with `compareCategories`. Only `category-header.tsx` knows a category's icon and tile.

```tsx
// One plain div per category: no landmark per category. The heading names the list.
const headingId = useId();
<div className="flex flex-col gap-2">
  <CategoryHeader id={headingId} category={category} count={items.length} />
  <ListGroup labelledBy={headingId}>
    {items.map((item) => {
      const meta = item.label ?? addedText(item.createdAt);
      // Two rows with the same name get the line under it in the bin's name too.
      const name = sameName(item) ? `${item.name}, ${meta}` : item.name;
      return (
        <ListRow
          key={item.id}
          title={item.name}
          meta={meta}
          onPress={() => openItem(item)}
          pressProps={{ "data-testid": "pantry-row", "aria-haspopup": "dialog" }}
          trailing={
            <TrashButton
              label={`Ta bort ${name}`}
              onPress={(bin) => {
                focusAfterRemoval(bin);
                remove(item);
              }}
            />
          }
        />
      );
    })}
  </ListGroup>
</div>
```

- `CategoryHeader({ category, count, id?, level?: 2 | 3 | 4, className? })`: the tile (emoji, `aria-hidden`), the name as a heading (`h2` by default) and the count, read as "1 vara" / "3 varor" and also the heading's description. `category` is a `CategoryName`, the same names as `Category`; an unknown one gets Övrigt's tile. A count that is not a whole number ≥ 0 shows as 0 (rounded down).
- `ListGroup({ children, labelledBy?, label?, className?, data-* })`: a `ul role="list"` card with hairline dividers and clipped corners.
- `ListRow({ title, meta?, leading?, trailing?, onPress? | href?, crossedOut?, srStatus?, as?, pressProps?, pressRef?, className?, data-* })`: an `li` (or `div` with `as="div"`, e.g. inside `<li><SwipeRow>`). With `onPress` the text is a button, with a non-empty `href` a link, otherwise plain text; its accessible name is the title and the line under it. `meta` shows unless it is null, undefined or "", and stops at two lines with "…". `leading` (e.g. `CheckCircle`) and `trailing` (e.g. `TrashButton`, a product chip with its own `max-w-*` and `truncate`) are separate controls with an inset focus ring. `crossedOut` strikes a ticked-off name through; say the same with `srStatus="i korgen"`. `pressProps` takes `data-*`, `aria-haspopup`, `aria-describedby`, `aria-expanded`, `aria-controls`, `aria-current`, `aria-label` (needed when the title is empty) and `prefetch` (links only); `pressRef` reaches the button or link; `data-*` on the row go to the `li`. Both `onPress` and `href`, or a press target without a name, give a console warning.
- `TrashButton({ label, onPress(bin), disabled?, ref?, className?, aria-describedby?, data-* })`: a 44 × 44 px grey bin with an inset focus ring; `label` is the full name ("Ta bort Gräddfil"). A second press on any bin within `trashPressGuardMs` (400 ms) is ignored, so a double tap never removes the row that slides up. The caller removes at once and offers "Ångra".
- `focusAfterRemoval(binOrRow, root?)`: after a removal, focus goes to the next bin, else the previous one, else the list's heading, else the page's `h1`.
- `Meter({ value, size?: "default" | "small", className? })`: 0–1, clamped (Infinity is 1, other non-finite values 0); hidden from screen readers, so the text beside it must say the same.
- Tokens: `size-tile`, `text-tile-icon`, `min-h-row`, `h-card-image`, `size-dish-thumb`, `h-meter`, `h-meter-small`, `bg-tile-clay`, `bg-tile-lilac` and `bg-overlay` (the light plate for a badge or heart on a recipe image).
