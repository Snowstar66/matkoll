import type { DishKind } from "@/lib/dish-kind";

// UX-13b: the line drawings of the dishes, on a 64 × 64 grid. Each line is a
// path in the app's green; the one warm detail is marked `warm`. A path of
// zero length ("M18 30h0") with round ends draws a dot (an eye, a crumb).
// Data only, so DishArt draws them and a preview page can too.

export type DishLine = { d: string; warm?: boolean };

export const dishDrawings: Record<DishKind, readonly DishLine[]> = {
  // A pot with a lid, two handles and steam.
  gryta: [
    { d: "M14 31v9a10 10 0 0 0 10 10h16a10 10 0 0 0 10-10v-9" },
    { d: "M10 31h44" },
    { d: "M14 35h-4M50 35h4" },
    { d: "M16 31c1-5 7-8 16-8s15 3 16 8" },
    { d: "M29 23a3 3 0 0 1 6 0" },
    { d: "M25 8c-1.6 2.2 1.6 3.8 0 6M32 6c-1.6 2.2 1.6 3.8 0 6M39 8c-1.6 2.2 1.6 3.8 0 6", warm: true },
  ],
  // A deep bowl on a foot, the soup's surface, a spoon and steam.
  soppa: [
    { d: "M9 30h46c0 11-10 19-23 19S9 41 9 30z" },
    { d: "M25 53h14" },
    { d: "M45 30l9-16" },
    { d: "M15 35c5 3 29 3 34 0", warm: true },
    { d: "M24 11c-1.6 2.2 1.6 3.8 0 6M32 9c-1.6 2.2 1.6 3.8 0 6", warm: true },
  ],
  // A deep rectangular dish with handles, its filling heaped over the rim.
  ugnsratt: [
    { d: "M11 32h42l-3 14a4 4 0 0 1-4 3H18a4 4 0 0 1-4-3z" },
    { d: "M7 32h4M53 32h4" },
    { d: "M14 32c0-4 3-6 6-5c1-4 7-5 9-1c2-4 8-4 10 0c2-3 8-2 9 2c2-1 4 2 4 4", warm: true },
  ],
  // An oval gratin dish seen from above, with ears and a browned top.
  gratang: [
    { d: "M8 30c0-5 11-8 24-8s24 3 24 8-11 8-24 8S8 35 8 30z" },
    { d: "M8 30l3 12a5 5 0 0 0 5 4h32a5 5 0 0 0 5-4l3-12" },
    { d: "M8 30H3M56 30h5" },
    { d: "M15 30c3-3 5 1 8-1s5-2 8 0 5 2 8 0 5-2 9 1", warm: true },
  ],
  // A fish on a platter: eye, gill, fin and tail.
  fisk: [
    { d: "M9 31c6-8 20-11 32-4l11-6v18l-11-6c-12 7-26 4-32-2z" },
    { d: "M17 29h0" },
    { d: "M24 24c2.5 3 2.5 10 0 13", warm: true },
    { d: "M31 25c2 1 4 2 5 1", warm: true },
    { d: "M6 46c4 4 48 4 52 0" },
  ],
  // A drumstick: the meat, the bone and its knuckle.
  kyckling: [
    { d: "M28 34c-6-6-6-16 1-22s17-5 22 1 4 16-3 21c-5 3-10 4-14 4z" },
    { d: "M28 34l-9 9" },
    { d: "M34 37l-9 9" },
    { d: "M19 43a4 4 0 1 0-4 5a4 4 0 1 0 6 4l4-6" },
    { d: "M36 17c4-1 9 1 11 5", warm: true },
  ],
  // A steak with its fat edge and a round bone, and grill marks.
  kott: [
    { d: "M9 33c0-10 9-17 21-17 7 0 10 3 16 3 6 0 10 4 10 10 0 11-11 20-26 20C17 49 9 43 9 33z" },
    { d: "M14 32c0-7 6-12 14-12" },
    { d: "M23 37a4 4 0 1 0 0.1 0" },
    { d: "M33 40l8-10M40 42l8-10", warm: true },
  ],
  // A bowl of spaghetti with a fork in it.
  pasta: [
    { d: "M8 38h48c0 8-10 13-24 13S8 46 8 38z" },
    { d: "M13 38c0-8 9-13 19-13s19 5 19 13" },
    { d: "M19 37c2-5 9-7 13-3M27 37c3-4 10-5 14-1M23 31c4-3 10-3 13 0", warm: true },
    { d: "M42 6l-7 20M38 26l-1 4M35 25l-2 4M41 27l-2 4" },
  ],
  // A wok with its long handle, and chopsticks lifting noodles.
  wok: [
    { d: "M7 32h42c0 10-9 17-21 17S7 42 7 32z" },
    { d: "M49 33l12-5" },
    { d: "M20 4l11 19M27 3l11 19" },
    { d: "M30 22c-3 3 1 6-2 10M34 23c-2 3 2 5 0 9M38 22c-1 3 2 6 0 10", warm: true },
  ],
  // A salad bowl with leaves and two tomato halves.
  sallad: [
    { d: "M7 34h50c0 10-11 16-25 16S7 44 7 34z" },
    { d: "M12 34c-3-8 1-16 10-18 2 8-2 15-10 18z" },
    { d: "M15 31l5-9" },
    { d: "M52 34c3-8-1-16-10-18-2 8 2 15 10 18z" },
    { d: "M49 31l-5-9" },
    { d: "M32 13c-6 5-7 14-3 21M32 13c6 5 7 14 3 21" },
    { d: "M22 34a5 5 0 0 1 10 0M33 34a5 5 0 0 1 10 0", warm: true },
  ],
  // A pie in its tin: a domed top with vents and a golden fluted crust.
  paj: [
    { d: "M9 37h46l-4 10a3 3 0 0 1-3 2H16a3 3 0 0 1-3-2z" },
    { d: "M13 35c2-9 10-14 19-14s17 5 19 14" },
    { d: "M26 29h4M34 29h4" },
    { d: "M9 37a3.8 3.8 0 0 1 7.7 0a3.8 3.8 0 0 1 7.6 0a3.8 3.8 0 0 1 7.7 0a3.8 3.8 0 0 1 7.7 0a3.8 3.8 0 0 1 7.6 0a3.8 3.8 0 0 1 7.7 0", warm: true },
  ],
  // A loaf of bread with its scoring.
  bakat: [
    { d: "M10 42c0-13 9-21 22-21s22 8 22 21v3a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" },
    { d: "M10 41h44" },
    { d: "M21 33l5-6M30 33l5-6M39 33l5-6", warm: true },
  ],
  // The fallback: a plate between a fork and a knife.
  tallrik: [
    { d: "M32 16a16 16 0 1 0 0.1 0" },
    { d: "M32 23a9 9 0 1 0 0.1 0", warm: true },
    { d: "M8 14v8a3 3 0 0 0 6 0v-8M11 14v36" },
    { d: "M56 14c-4 3-5 10-5 17h5v19" },
  ],
};
