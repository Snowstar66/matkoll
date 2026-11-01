import type { Destination } from "./destinations";

/**
 * A destination's icon in the tab bar and the side menu (ikoner.html, variant
 * B): the grey line icon, or, on the current destination, its filled twin in
 * accent. A destination without a filled twin (Inställningar, Hjälp och tips)
 * keeps its line icon with a soft fill when current.
 */
export function DestinationIcon({ destination, current, size }: { destination: Destination; current: boolean; size: number }) {
  const { Icon, FilledIcon } = destination;
  if (current && FilledIcon) return <FilledIcon size={size} className="text-accent" />;
  return <Icon size={size} tinted={current} />;
}
