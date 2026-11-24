import { playChecks } from "../checks/play";
import { addPeople } from "../people";
import type { SimFake, SimPerson, SimScenario, SimSeeded } from "../types";

const PAR = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
type Tee = { name: string; rating: number | null; slope: number | null };
const RATED_TEE: Tee = { name: "Blue", rating: 70.4, slope: 124 };
const UNRATED_TEE: Tee = { name: "Blue", rating: null, slope: null };

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function baseSetup(tee: Tee, extra: object = {}) {
  return {
    course: { ref: "sim:stevens-park", name: "Stevens Park Golf Course", place: "Dallas, TX", par: PAR, strokeIndex: null, tees: [tee] },
    tee, holes: "18", stats: false, countForHandicap: true, datePlayed: today(), ...extra,
  };
}

async function createRound(fake: SimFake, host: SimPerson, setup: object, invites: SimPerson[]): Promise<string> {
  const res = await fake.db.query<{ id: string }>("select create_shared_round($1, $2::jsonb, $3::uuid[]) as id", [host.id, JSON.stringify(setup), invites.map((p) => p.id)]);
  return res.rows[0].id;
}

// An invited player cannot open the round yet (the app only shows it to joined players): they start on Home, where the invite card is.
const phone = (p: SimPerson, round: string, invited = false) => ({ person: p.key, label: p.name, startPath: invited ? "/" : `/rounds/new?round=${round}` });

export const playSolo: SimScenario = {
  id: "play-solo", simulator: "scoring", feature: "Play", label: "Play: solo", checks: playChecks({ expectCounted: true }),
  async seed(fake): Promise<SimSeeded> {
    const [cam] = await addPeople(fake, ["cam"]);
    const round = await createRound(fake, cam, baseSetup(RATED_TEE, { players: [], guests: [], game: null }), []);
    return { people: [cam], phones: [phone(cam, round)], refs: { round } };
  },
};

export const playFriends: SimScenario = {
  id: "play-friends", simulator: "scoring", feature: "Play", label: "Play: with friends", checks: playChecks({ expectCounted: true, withGuest: true }),
  async seed(fake): Promise<SimSeeded> {
    const [cam, cade, jake] = await addPeople(fake, ["cam", "cade", "jake"]);
    const setup = baseSetup(RATED_TEE, {
      players: [
        { name: cade.name, profileId: cade.id, handicap: null },
        { name: jake.name, profileId: jake.id, handicap: null },
      ],
      guests: [{ id: "g0", name: "Uncle Rob", handicap: null }],
      game: { id: "skins", net: false, birdiesDouble: false },
    });
    const round = await createRound(fake, cam, setup, [cade, jake]);
    await fake.db.query("select answer_shared_round_invite($1, $2, true)", [cade.id, round]);
    return { people: [cam, cade, jake], phones: [phone(cam, round), phone(cade, round), phone(jake, round, true)], refs: { round } };
  },
};

export const playUnrated: SimScenario = {
  id: "play-unrated", simulator: "scoring", feature: "Play", label: "Play: tee with no rating", checks: playChecks({ expectCounted: false }),
  async seed(fake): Promise<SimSeeded> {
    const [cam] = await addPeople(fake, ["cam"]);
    const round = await createRound(fake, cam, baseSetup(UNRATED_TEE, { players: [], guests: [], game: null }), []);
    return { people: [cam], phones: [phone(cam, round)], refs: { round } };
  },
};

export const PLAY_SCENARIOS: SimScenario[] = [playSolo, playFriends, playUnrated];
