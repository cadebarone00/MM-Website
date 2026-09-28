// Sponsors shown in the header's "Presented By:" slot. The header rotates
// through them in this order, one at a time. To add a sponsor, drop its
// logo in public/sponsors/ and add a line here.
export type Sponsor = {
  name: string;
  logoSrc: string;
  logoWidth: number;
  logoHeight: number;
};

export const SPONSORS: Sponsor[] = [
  { name: "DCS Logo", logoSrc: "/sponsors/dcs-logo.png", logoWidth: 380, logoHeight: 105 },
  // Crown Homes — turned on once its real logo is saved to public/sponsors/crown-homes-logo.png
  // (set logoWidth/logoHeight to that image's size).
  // { name: "Crown Homes Logo", logoSrc: "/sponsors/crown-homes-logo.png", logoWidth: 380, logoHeight: 105 },
];
