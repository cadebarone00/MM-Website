/**
 * Words for the website's tabs (project_specs.md "The Maroon website … read-only stats and history"). Plain copy kept
 * here so the pages stay simple. The website only shows and explains: every "do something" points to the app.
 * Game rules are written out here on purpose: marketing must not import the app's scoring code (README boundary).
 */

export const WEBSITE_TABS = [
  { href: "/website", label: "Home" },
  { href: "/website/features", label: "Features" },
  { href: "/website/tutorials", label: "Tutorials" },
  { href: "/website/games", label: "Games" },
  { href: "/tap-in", label: "Live" },
  { href: "/dashboard/stats", label: "Stats" },
  { href: "/dashboard/history", label: "History" },
  { href: "/website/help", label: "Help" },
] as const;

export const FEATURES = [
  { id: "golf-trips", title: "Golf Trips", lead: "The whole weekend in one place.",
    points: ["Dates, destination, weather and the itinerary everyone can see.", "Flights, lodging and who's arriving when.", "Team draft and match selection for trips with a competition.", "A Home screen that always shows what's next."] },
  { id: "play", title: "Play a round", lead: "Any round, any game, with anyone.",
    points: ["One scorekeeper for the group, friends join with a code, guests welcome.", "17 games, from Skins and Wolf to Nassau and Scramble.", "Side games: greenies, longest drive, closest to the pin.", "Money is tracked for you, settled between you."] },
  { id: "tourneys", title: "Tourneys", lead: "Give your annual tradition a proper home.",
    points: ["Multiple rounds, gross or net, stroke play.", "Join by code, watch by code.", "Next year's edition starts from this year's."] },
  { id: "leagues", title: "Leagues", lead: "A season of golf, week after week.",
    points: ["Every qualifying round counts toward the standings.", "Skins and pairs alongside the leaderboard.", "Share the standings with anyone you like."] },
  { id: "live", title: "The Maroon Live", lead: "Follow every shot from anywhere.",
    points: ["A live leaderboard for every trip, tournament and league.", "Public, link only or private: the organizer decides.", "TV mode: a scrolling leaderboard for the big screen."] },
  { id: "gps", title: "GPS", lead: "Know the hole before you hit.",
    points: ["Distances to the front, middle and back of the green.", "Works on the course in your hand."] },
  { id: "profiles", title: "Profiles & stats", lead: "Your golf identity, kept for good.",
    points: ["Handicap, scoring average, best round and trends.", "Every round saved, with the scorecard.", "Public or private: you choose who sees it."] },
] as const;

export const TUTORIALS = [
  { id: "create-trip", title: "Create a golf trip", time: "3 min",
    steps: ["Open the Golf Trips tab and tap Create a trip.", "Name the trip, pick the dates and search for the destination.", "Add the courses for each day; the scorecards come with them.", "Choose whether the trip has a competition (individual, teams or both).", "Tap Create. Your trip's Home screen is ready to share."] },
  { id: "invite", title: "Invite your crew", time: "1 min",
    steps: ["Open the trip and go to Settings, then Players.", "Share the join code or send invites by email.", "Friends tap the link or type the code in the app to join.", "Everyone who joins shows up in Players straight away."] },
  { id: "draft", title: "Team draft and match selection", time: "4 min",
    steps: ["As organizer, set the team format (2 Teams, Pairs, 3-Ball or 4-Ball) and pick captains.", "Start the draft: captains take turns picking players, and every pick is saved.", "Before each round, captains set their matches in Match Selection.", "Matches lock when both captains are done, and show on the Golf tab."] },
  { id: "start-round", title: "Start a round with friends", time: "2 min",
    steps: ["On the Play tab tap Play a round and search for the course.", "Pick the tees and 18, front 9 or back 9.", "Add players: invite friends with the app, or add guests by name.", "Choose a game and side games if you want them, then Start."] },
  { id: "keep-score", title: "Keep score", time: "2 min",
    steps: ["One person keeps score for the group.", "Pull up Scoring and set each player's score with + and −.", "Make the hole's game pick if there is one (Wolf partner, Bingo Bango Bongo …).", "Tap Next hole. Everyone in the round sees the leaderboard update.", "After the last hole, Round complete shows the results; Save & exit saves everyone's round."] },
  { id: "pick-game", title: "Pick a game", time: "1 min",
    steps: ["When starting a round, open Game and choose from 17 games.", "The app only offers games that fit your group size.", "Set the options: net or gross, birdie bonuses, money per point, carry-overs.", "Not sure which? The Games tab on this website explains every one."] },
  { id: "watch-live", title: "Watch live and TV mode", time: "1 min",
    steps: ["Organizers choose who can watch in Settings: Public, Link only or Private.", "Share the live link; anyone with it can follow along, no app needed.", "Add /tv to the end of the link for a full-screen leaderboard on a TV."] },
  { id: "import-trip", title: "Import a past trip", time: "5 min",
    steps: ["Go to Golf Trips and choose Import a past trip.", "Walk through it in the app, or fill in the spreadsheet template.", "Players check and fix their own scores.", "The trip, its results and everyone's rounds join your history."] },
] as const;

export type GameRule = { name: string; players: string; kind: "Points" | "Match & stroke" | "Team format"; how: string; example: string };
export const GAME_RULES: GameRule[] = [
  { name: "Stroke Play", players: "2–5", kind: "Match & stroke", how: "Count every shot. Lowest total wins. Net uses handicap strokes.", example: "Cam shoots 78, Cade 81: Cam wins by 3." },
  { name: "Stableford", players: "2–5", kind: "Points", how: "Points each hole: par 2, birdie 3, eagle 4, bogey 1. Most points wins.", example: "Par, birdie, bogey = 2 + 3 + 1 = 6 points." },
  { name: "Match Play", players: "2 or 4", kind: "Match & stroke", how: "Win holes, not strokes. 1 v 1, or 2 v 2 best ball. Most holes won takes the match.", example: "3 holes won, 2 lost: 1 UP." },
  { name: "Nassau", players: "2 or 4", kind: "Match & stroke", how: "Three matches in one: front 9, back 9 and overall. Optional auto-press when a side goes 2 down.", example: "Win the front, lose the back, win overall: 2 of 3." },
  { name: "Best Ball", players: "4", kind: "Match & stroke", how: "2 v 2. Each team's best score on a hole counts.", example: "Team scores 4 and 5 on a hole: the team's 4 counts." },
  { name: "Skins", players: "2–5", kind: "Points", how: "The outright low score wins the hole's skin. Ties carry the skin to the next hole (or kill it, if carry-overs are off).", example: "Holes 1–2 tied, Jake wins 3: Jake takes 3 skins." },
  { name: "Wolf", players: "4–5", kind: "Points", how: "The Wolf rotates. After each drive they pick a partner, or go Lone Wolf for double points.", example: "Lone Wolf wins the hole: double points from everyone." },
  { name: "Vegas", players: "4", kind: "Points", how: "2 v 2. Team scores make a 2-digit number (4 and 5 = 45). Low number wins the difference. A birdie flips the other team's number.", example: "45 v 56: the first team wins 11 points." },
  { name: "Daytona", players: "5", kind: "Points", how: "Left pair v right pair, best ball. The middle player can't lose, and wins from everyone with the outright low.", example: "The middle player makes the only birdie: wins from all four." },
  { name: "Bingo Bango Bongo", players: "2–5", kind: "Points", how: "A point each hole for first on the green, closest once everyone's on, and first in the hole.", example: "Cade is first on and first in: 2 points." },
  { name: "Nines (5-3-1)", players: "3", kind: "Points", how: "9 points a hole: 5 for low, 3 for middle, 1 for high. Ties split.", example: "Scores 4, 5, 6: 5, 3 and 1 points." },
  { name: "Sixes", players: "4", kind: "Points", how: "2 v 2 best ball. Partners change every 6 holes so everyone partners everyone.", example: "Holes 1–6 Cam & Cade, 7–12 Cam & Jake, 13–18 Cam & Luke." },
  { name: "Snake", players: "2–5", kind: "Match & stroke", how: "Three-putt and you hold the snake. Whoever has it at the end pays everyone.", example: "Luke three-putts 17: Luke holds the snake." },
  { name: "Scramble", players: "2–5", kind: "Team format", how: "Everyone hits, the team picks the best shot, and all play from there. One team score per hole.", example: "Best drive, best approach, best putt: team makes 3." },
  { name: "Shamble", players: "2–5", kind: "Team format", how: "Best drive, then everyone plays their own ball in. The team's best score counts.", example: "From the best drive, scores 4, 5, 5: team scores 4." },
  { name: "Alternate Shot", players: "2 or 4", kind: "Team format", how: "Partners take turns hitting one ball. One team score per hole.", example: "Cam drives, Cade hits the approach, Cam putts." },
  { name: "Chapman", players: "2 or 4", kind: "Team format", how: "Both drive, swap balls for the second shot, pick one ball, then alternate in.", example: "Swap, keep Cade's ball, alternate from there." },
];
export const SIDE_GAMES = [
  { name: "Greenies", how: "On every par 3, closest to the pin who's on the green wins. Nobody on? It carries to the next par 3." },
  { name: "Longest drive", how: "On the holes the host picks, the longest drive in the fairway wins." },
  { name: "Closest to the pin", how: "On the holes the host picks, the closest shot to the pin wins." },
] as const;

export const FAQ = [
  { q: "Can I play or keep score on the website?", a: "No. The website is for looking back: your stats, your history and how things work. Rounds, trips, tournaments and leagues all happen in the app." },
  { q: "Is my account the same on the app and the website?", a: "Yes. Sign in with the same email and you'll see the same rounds and stats." },
  { q: "Who can see my stats?", a: "You choose. A Public profile shows your stats to other golfers; a Private profile keeps them to you." },
  { q: "Why are some stats blank?", a: "Putts, fairways and greens only count rounds where Track stats was on. Scoring average needs at least one 18-hole round." },
  { q: "How do I watch a trip or tournament?", a: "Open the live link the organizer shared, or find a Public event on the Live tab. No account needed." },
  { q: "When is the app available?", a: "The Maroon is coming to iOS and Android. Sign up for updates from the Download section on the Home page." },
] as const;
