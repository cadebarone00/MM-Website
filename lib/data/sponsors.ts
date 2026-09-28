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
  { name: "Test Sponsor", logoSrc: "/sponsors/dcs-logo.png", logoWidth: 380, logoHeight: 105 },
];
