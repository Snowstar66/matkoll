// Client-safe entry: types and domain (AD-1).
export {
  addDays,
  dayText,
  isIsoDate,
  isSavableWeek,
  isWeekOver,
  isoWeekNumber,
  mondayOf,
  swedishToday,
  weekEnd,
  weekLabel,
  weekOfValidTo,
  weekPillLabel,
  weekShortLabel,
  weekStartOf,
} from "./domain/week";
export { FOOD_CATEGORIES, foodSection, parseIcaOfferPage, type IcaOffer } from "./domain/ica-offer-page";
export { offerDisplay, type OfferDisplay } from "./domain/offer-display";
export { clip, offerName, type OfferName } from "./domain/offer-name";
export {
  fetchedAtText,
  fetchingOffersText,
  groupOffers,
  maxOfferLabelChars,
  maxOfferNameChars,
  maxOfferNoteChars,
  maxOfferPriceChars,
  maxOffersPerWeek,
  noOffersText,
  OFFER_SOURCES,
  offerMetaText,
  offersCountWords,
  offersFetchedText,
  offersFetchIntervalMs,
  offersSheetSubtitle,
  offersSkippedText,
  offersSummaryText,
  openOffersPageText,
  toOfferDraft,
  type OfferDraft,
  type OfferSource,
  type StoreOffer,
} from "./domain/offer";
export { bestStore, bestStoreLine, bestStoreReason, bestStoreTip, fitPhrase, fittingOffers, matchNames, type BestStore, type FitMatch, type FitSource } from "./domain/best-store";
export { storeBadgeText, storeBadgeTone } from "./domain/store-badge";
