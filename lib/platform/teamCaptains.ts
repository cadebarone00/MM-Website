export type CaptainPlayer = { key:string;name:string;team?:number };
export type TeamCaptains = Record<string,string>;
export type CaptainContext = {players:CaptainPlayer[];organizerKey:string|null;actorKey:string|null;teamCount:number};
export function captainTeam(captains:TeamCaptains,key:string):number|null {
 const team=Object.keys(captains).find(team=>captains[team]===key);return team===undefined?null:Number(team);
}
export function playerRoleLabel(key:string,organizerKey:string|null,captains:TeamCaptains,teamNames:string[]):string {
 const team=captainTeam(captains,key),name=team===null?"":teamNames[team]?.trim();
 const captain=team===null?null:name?name+" Captain":"Captain";
 return key===organizerKey?"Organizer"+(captain?" & "+captain:""):captain??"Player";
}
function candidate(context:CaptainContext,captains:TeamCaptains,key:string,team:number) {
 const player=context.players.find(player=>player.key===key);
 if(!player || !Number.isInteger(team) || team<0 || team>=context.teamCount) throw new Error("Select a joined player and a valid team.");
 if(captainTeam(captains,key)!==null) throw new Error("This player is already a captain.");
 if(player.team!==undefined && player.team!==team) throw new Error("Choose a player on this team.");
 return player;
}
/** Organizer assigns or replaces a captain. It never changes organizer authority. */
export function assignCaptain(context:CaptainContext,captains:TeamCaptains,key:string,team:number):TeamCaptains {
 if(!context.actorKey || context.actorKey!==context.organizerKey) throw new Error("Only the organizer can assign or replace captains.");
 candidate(context,captains,key,team);return {...captains,[team]:key};
}
/** Once filled, only that captain can pass the role to another eligible player. */
export function handOffCaptain(context:CaptainContext,captains:TeamCaptains,key:string,team:number):TeamCaptains {
 if(!context.actorKey || captains[String(team)]!==context.actorKey) throw new Error("Only the current captain can pass this role.");
 candidate(context,captains,key,team);return {...captains,[team]:key};
}
