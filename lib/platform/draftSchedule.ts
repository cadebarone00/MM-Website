type TeamSchedule = { selection?: unknown; date?: unknown; time?: unknown };
const stamp = (date: unknown,time: unknown) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? Date.parse(date+"T"+time+":00Z") : NaN;
export function matchDraftTimeError(team: TeamSchedule,date: unknown,time: unknown): string | null {
 if(team.selection!=="Draft" || !Number.isFinite(stamp(date,time))) return null;
 const teamAt=stamp(team.date,team.time);
 if(!Number.isFinite(teamAt)) return null;
 return stamp(date,time)<teamAt+600000 ? "Match drafts must be at least 10 minutes after the team draft." : null;
}
export function draftScheduleError(setup: Record<string,unknown>): string | null {
 const team={selection:setup.teamSelection,date:setup.draftDate,time:setup.draftTime};
 const global=setup.allRoundsMatch as Record<string,unknown> | undefined;
 const choices=setup.matchSelections as Record<string,Record<string,unknown>> | undefined;
 const effective=setup.matchPerRound ? Object.values(choices??{}) : [global,...Object.values(choices??{}).map(own=>({...global,method:global?.method,date:own.date||global?.date,time:own.time||global?.time}))];
 for(const choice of effective) if(choice?.method==="Match Draft") { const error=matchDraftTimeError(team,choice.date,choice.time);if(error)return error; }
 return null;
}
