/** 最小化环境声明：circular-natal-horoscope-js 不带 TS 类型（公有领域库）。 */
declare module "circular-natal-horoscope-js" {
  export interface OriginParams {
    year: number;
    month: number; // 0-indexed
    date: number;
    hour: number;
    minute: number;
    latitude: number;
    longitude: number;
  }
  export class Origin {
    constructor(params: OriginParams);
  }
  interface Ecliptic {
    DecimalDegrees?: number;
    ArcDegrees?: { degrees: number; minutes: number; seconds: number };
  }
  interface ChartPosition {
    Ecliptic?: Ecliptic;
  }
  interface SignLike {
    label?: string;
  }
  interface Body {
    label?: string;
    key?: string;
    Sign?: SignLike;
    House?: { id?: number };
    ChartPosition?: ChartPosition;
    isRetrograde?: boolean;
  }
  interface Aspect {
    point1Label?: string;
    point2Label?: string;
    aspectKey?: string;
    label?: string;
    orb?: number;
  }
  interface Angle {
    Sign?: SignLike;
    ChartPosition?: ChartPosition;
  }
  export class Horoscope {
    constructor(params: {
      origin: Origin;
      houseSystem?: string;
      zodiac?: string;
      aspectPoints?: string[];
      aspectTypes?: string[];
      language?: string;
    });
    Ascendant: Angle;
    Midheaven: Angle;
    CelestialBodies: Record<string, Body> & { all?: Body[] };
    Aspects: { all?: Aspect[]; types?: Record<string, Aspect[]> };
  }
  const _default: { Origin: typeof Origin; Horoscope: typeof Horoscope };
  export default _default;
}
