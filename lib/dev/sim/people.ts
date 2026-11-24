import type { SimFake, SimPerson } from "./types";

/** The pretend people. The key is also the phone's host subdomain (cam.localhost). */
export const PEOPLE: Record<string, string> = { cam: "Cam", cade: "Cade", jake: "Jake" };

/**
 * Makes one account per key. The fake's addUser creates the auth user and a profile with the same id, so `id` is both
 * the account id and the profile id the app passes as p_profile. Username = key; display name = the PEOPLE name.
 */
export async function addPeople(fake: SimFake, keys: string[]): Promise<SimPerson[]> {
  const people: SimPerson[] = [];
  for (const key of keys) {
    const name = PEOPLE[key];
    if (!name) throw new Error(`Unknown pretend person: ${key}`);
    const user = await fake.addUser({ name: key });
    await fake.db.query("update profiles set display_name = $2 where id = $1", [user.id, name]);
    people.push({ key, name, id: user.id, token: user.token });
  }
  return people;
}
