// Client-safe entry: types and domain.
export {
  choicePath,
  clampTourPage,
  isLastTourPage,
  pageAfterSwipe,
  replayReturnPath,
  areasTourPage,
  isAreasTourPage,
  tourPageCount,
  tourPageLabel,
  tourSwipeDistancePx,
  welcomeRoute,
  type TourExit,
} from "./domain/tour";
export { tourSeenCookie, tourSeenCookieText } from "./domain/tour-cookie";
