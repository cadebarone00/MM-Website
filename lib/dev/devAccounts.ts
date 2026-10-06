/** DEV ONLY: mock accounts for the player-rounds preview. Alex isn't on the trip (tests Private for strangers). */
export interface DevAccount { id: string; name: string; onTrip: boolean }
export const DEV_ACCOUNTS: DevAccount[] = [
  { id: "dev-cade", name: "Cade Barone", onTrip: true },
  { id: "dev-jake", name: "Jake Parker", onTrip: true },
  { id: "dev-mike", name: "Mike Chen", onTrip: true },
  { id: "dev-alex", name: "Alex Rivera", onTrip: false },
];
export const DEFAULT_DEV_ACCOUNT = "dev-cade";
export const devAccount = (id: string | undefined) => DEV_ACCOUNTS.find((account) => account.id === id) ?? DEV_ACCOUNTS[0];
export const devPlayTogether = (a: string, b: string) => devAccount(a).onTrip && devAccount(b).onTrip;
