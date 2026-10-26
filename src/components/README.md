Shared UI building blocks used by more than one feature module; no data access and no feature imports (AD-1, AD-17).

Each follows the same-named entry under Components in DESIGN.md (look) and Component Patterns in EXPERIENCE.md (behaviour). Colours, sizes and corners come only from the tokens in `src/app/globals.css` through Tailwind classes; never hex values. The README at the project root lists the blocks.

## Epic 11 building blocks (Story 11.1)

The new look in Lagersaldo, Inköpslista, Recept and Matsedel (Stories 11.3–11.5) is built from these. The category of an item comes from `displayCategory(section, name)` in `@/features/catalog`; sort with `compareCategories`. Only `category-header.tsx` knows a category's icon and tile.

```tsx
const id = useId();
<section aria-labelledby={id} className="flex flex-col gap-2">
  <CategoryHeader id={id} category={category} count={items.length} />
  <ListGroup labelledBy={id}>
    {items.map((item) => (
      <ListRow
        key={item.id}
        title={item.name}
        meta={item.label ?? addedText(item.createdAt)}
        onPress={() => openItem(item)}
        pressProps={{ "data-testid": "pantry-row" }}
        trailing={<TrashButton label={`Ta bort ${item.name}`} onPress={() => remove(item)} />}
      />
    ))}
  </ListGroup>
</section>
```

- `CategoryHeader({ category, count, id?, className? })`: the tile (emoji, `aria-hidden`), the name as an `h2` and the count, read as "1 vara" / "3 varor". `category` is a `CategoryName`, the same names as `Category`.
- `ListGroup({ children, labelledBy?, label?, className?, data-* })`: a `ul` card with hairline dividers and clipped corners.
- `ListRow({ title, meta?, leading?, trailing?, onPress? | href?, crossedOut?, as?, pressProps?, className?, data-* })`: an `li` (or `div` with `as="div"`, e.g. inside `<li><SwipeRow>`). With `onPress` the text is a button, with `href` a link, otherwise plain text; its accessible name is the title and the line under it. `leading` (e.g. `CheckCircle`) and `trailing` (e.g. `TrashButton`, a product chip with its own `max-w-*` and `truncate`) are separate controls. `crossedOut` strikes a ticked-off name through. `pressProps` takes `data-*`, `aria-haspopup` and `aria-describedby` for the button or link; `data-*` on the row go to the `li`.
- `TrashButton({ label, onPress, disabled?, ref?, className?, data-* })`: a 44 × 44 px grey bin; `label` is the full name ("Ta bort Gräddfil"). The caller removes at once and offers "Ångra"; `ref` moves focus to the next bin.
- `Meter({ value, size?: "default" | "small", className? })`: 0–1, clamped; hidden from screen readers, so the text beside it must say the same.
- Tokens: `size-tile`, `min-h-row`, `h-card-image`, `size-dish-thumb`, `h-meter`, `h-meter-small`, `bg-tile-clay`, `bg-tile-lilac` and `bg-overlay` (the light plate for a badge or heart on a recipe image).
