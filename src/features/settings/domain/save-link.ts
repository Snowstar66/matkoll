// Story 1.13: the address prefix and the bookmarklet for "Spara i Matkoll", built
// from the site's own origin so they work on localhost and on the published site.

/** The address a recipe page's link is appended to (encoded). */
export function importUrlPrefix(origin: string): string {
  return `${origin}/recept/importera?url=`;
}

/** A bookmarklet that opens Matkoll's import for the page Pontus is on, in a new tab. */
export function bookmarklet(origin: string): string {
  return `javascript:void window.open(${JSON.stringify(importUrlPrefix(origin))}+encodeURIComponent(location.href),"_blank")`;
}
