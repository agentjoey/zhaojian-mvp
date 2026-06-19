declare module "tz-lookup" {
  /** (lat, lon) → IANA 时区，如 "Asia/Shanghai"。 */
  const tzlookup: (lat: number, lon: number) => string;
  export default tzlookup;
}
