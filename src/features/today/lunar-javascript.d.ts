// lunar-javascript ships no types; only what Dagens uses is declared.
declare module "lunar-javascript" {
  export class Lunar {
    getDayYi(): string[];
    getDayJi(): string[];
  }
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    getLunar(): Lunar;
  }
}
