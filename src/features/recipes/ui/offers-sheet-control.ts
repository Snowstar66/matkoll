"use client";

import { createContext } from "react";

/**
 * Story 9.3: whether the sheet Veckans erbjudanden that the page gave the library
 * is open, and how to close it. The library provides it around the page's sheet
 * (`LibraryOffers.sheet`); the sheet, a component of the route, reads it. A context
 * and not a cloned element, since an element from the server may still be loading.
 */
export type OffersSheetControl = { open: boolean; onClose: () => void };

export const OffersSheetControlContext = createContext<OffersSheetControl>({ open: false, onClose: () => undefined });
