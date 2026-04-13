export interface Options {
  threshold: number;
  leftBias: number;
  minRegionRatio: number;
  featherRadius: number;
}

export const defaultOptions: Options = {
  threshold: 0.55,
  leftBias: 0.45,
  minRegionRatio: 0.01,
  featherRadius: 1,
};
