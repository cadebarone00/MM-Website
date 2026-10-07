"use client";

import { useState, type ReactNode } from "react";
import { BedDouble, CalendarDays, Car, Clock, MapPin, Plane, Plus, Trash2 } from "lucide-react";
import { ITINERARY_KIND_LABEL, itineraryDay, itineraryTime } from "@/lib/platform/golfTripItinerary";
import { checkTravelInput, cleanDetails, myItems, travelTitle, type TravelDetails, type TravelItem, type TravelKind, type TripTravel } from "@/lib/platform/tripTravel";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import { TRAVEL_KIND_ART, TravelKindIcon } from "./travelKinds";
import homeStyles from "./GolfTripHome.module.css";
import styles from "./GolfTripMyTravel.module.css";

/** What a player can add themselves (dinners and tee times come from the organizer). */
const ADDABLE: { kind: TravelKind; label: string; icon: typeof Plane }[] = [
  { kind: "flight", label: "Flight", icon: Plane },
  { kind: "ride", label: "Ride or rental car", icon: Car },
  { kind: "lodging", label: "Lodging", icon: BedDouble },
  { kind: "other", label: "Other plans", icon: CalendarDays },
];

export type MyTravelChange =
  | { type: "add"; item: Omit<TravelItem, "createdBy" | "source" | "optOutAllowed"> }
  | { type: "update"; id: string; changes: Pick<TravelItem, "details" | "startsAt" | "endsAt" | "joinPolicy"> }
  | { type: "remove"; id: string };

/**
 * Info → My Info → My travel: your own flights, rides, lodging and plans. Add, tap one to edit, or delete it (asks
 * first). Everything here builds your itinerary (and the Home "what's next" cards) automatically.
 */
export function GolfTripMyTravel({ travel, onChange }: { travel: TripTravel; onChange: (change: MyTravelChange) => void }) {
  const items = myItems(travel);
  const [choosing, setChoosing] = useState(false);
  const [editing, setEditing] = useState<{ kind: TravelKind; item?: TravelItem } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TravelItem | null>(null);

  return <section className={homeStyles.infoSection} aria-label="My travel">
    <div className={homeStyles.infoHeaderRow}><h2 className={homeStyles.eventsHeading}>My travel</h2></div>
    {items.length === 0 && <p className={styles.empty}>Add your flights, ride and hotel — they&apos;ll build your itinerary.</p>}
    {items.map((item) => <div key={item.id} className={styles.row}>
      <button type="button" className={styles.rowButton} onClick={() => setEditing({ kind: item.kind, item })} aria-label={`Edit ${ITINERARY_KIND_LABEL[item.kind]}: ${travelTitle(item)}`}>
        <span className={homeStyles.eventArt} style={{ background: TRAVEL_KIND_ART[item.kind] }}><TravelKindIcon kind={item.kind} size={24} /></span>
        <span className={homeStyles.eventInfo}>
          <span className={homeStyles.eventHost}>{rowLabel(item)}</span>
          <span className={homeStyles.eventTitle}>{travelTitle(item)}</span>
          <span className={homeStyles.eventMeta}><Clock size={14} strokeWidth={2} aria-hidden />{whenLabel(item)}</span>
          {placeLabel(item) && <span className={homeStyles.eventMeta}><MapPin size={14} strokeWidth={2} aria-hidden />{placeLabel(item)}</span>}
        </span>
      </button>
      <button type="button" className={styles.delete} aria-label={`Delete ${travelTitle(item)}`} onClick={() => setConfirmDelete(item)}><Trash2 size={16} strokeWidth={2} aria-hidden /></button>
    </div>)}
    <button type="button" className={homeStyles.addItemButton} onClick={() => setChoosing(true)}><Plus size={16} strokeWidth={2.5} aria-hidden />Add</button>

    {choosing && <GolfTripActionSheet label="Add to my travel" onClose={() => setChoosing(false)}
      actions={ADDABLE.map(({ label, icon }) => ({ label, icon }))}
      onAction={(label) => { const pick = ADDABLE.find((option) => option.label === label); setChoosing(false); if (pick) setEditing({ kind: pick.kind }); }} />}

    {editing && <TravelForm kind={editing.kind} item={editing.item} onCancel={() => setEditing(null)}
      onSave={(details, startsAt, endsAt) => {
        if (editing.item) onChange({ type: "update", id: editing.item.id, changes: { details, startsAt, endsAt, joinPolicy: editing.item.joinPolicy } });
        else onChange({ type: "add", item: { id: `tr-${crypto.randomUUID()}`, kind: editing.kind, details, startsAt, endsAt, joinPolicy: "none" } });
        setEditing(null);
      }} />}

    {confirmDelete && <div className={homeStyles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Delete confirmation">
      <div className={homeStyles.deleteDialog}>
        <p className={homeStyles.deletePrompt}>Delete {travelTitle(confirmDelete)}?</p>
        <button type="button" className={homeStyles.cancelButton} onClick={() => setConfirmDelete(null)}>Keep it</button>
        <button type="button" className={homeStyles.deleteButton} onClick={() => { onChange({ type: "remove", id: confirmDelete.id }); setConfirmDelete(null); }}>Delete</button>
      </div>
    </div>}
  </section>;
}

function rowLabel(item: TravelItem): string {
  if (item.kind === "ride") return item.details.rideType === "rental" ? "Rental car" : "Driving";
  return ITINERARY_KIND_LABEL[item.kind];
}

/** "Thu, Apr 22 · 6:10 AM – 8:05 AM", or across days "Thu, Apr 22 3:00 PM – Sun, Apr 25 10:00 AM". */
function whenLabel(item: TravelItem): string {
  const start = `${itineraryDay(item.startsAt)} · ${itineraryTime(item.startsAt)}`;
  if (!item.endsAt) return start;
  return item.endsAt.slice(0, 10) === item.startsAt.slice(0, 10) ? `${start} – ${itineraryTime(item.endsAt)}` : `${start} – ${itineraryDay(item.endsAt)} ${itineraryTime(item.endsAt)}`;
}

function placeLabel(item: TravelItem): string {
  const d = item.details;
  if (item.kind === "flight") return d.airline ?? "";
  if (item.kind === "ride") return [d.rideType === "rental" ? d.place : d.to && `To ${d.to}`, d.seats !== undefined ? `${d.seats} open seat${d.seats === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
  return [d.place, d.note].filter(Boolean).join(" · ");
}

type FormFields = { airline: string; flightNumber: string; from: string; to: string; rideType: "driving" | "rental"; place: string; seats: string; name: string; note: string; startsAt: string; endsAt: string };

/**
 * Itinerary tab → "+ Add": the same pop-ups as My Info's Add — pick flight / ride or rental car / lodging / other plans,
 * then fill it in. Saving puts it on your itinerary (and Home's boxes).
 */
export function GolfTripAddTravel({ onChange, className }: { onChange: (change: MyTravelChange) => void; className?: string }) {
  const [choosing, setChoosing] = useState(false);
  const [adding, setAdding] = useState<TravelKind | null>(null);
  return <>
    <button type="button" className={className ?? homeStyles.addItemButton} aria-haspopup="dialog" onClick={() => setChoosing(true)}><Plus size={16} strokeWidth={2.5} aria-hidden />Add</button>
    {choosing && <GolfTripActionSheet label="Add to my travel" onClose={() => setChoosing(false)}
      actions={ADDABLE.map(({ label, icon }) => ({ label, icon }))}
      onAction={(label) => { const pick = ADDABLE.find((option) => option.label === label); setChoosing(false); if (pick) setAdding(pick.kind); }} />}
    {adding && <TravelForm kind={adding} onCancel={() => setAdding(null)}
      onSave={(details, startsAt, endsAt) => {
        onChange({ type: "add", item: { id: `tr-${crypto.randomUUID()}`, kind: adding, details, startsAt, endsAt, joinPolicy: "none" } });
        setAdding(null);
      }} />}
  </>;
}

/** Add / edit sheet. Fields change with the kind; problems show under each field when you tap Save. */
function TravelForm({ kind, item, onSave, onCancel }: {
  kind: TravelKind; item?: TravelItem; onSave: (details: TravelDetails, startsAt: string, endsAt?: string) => void; onCancel: () => void;
}) {
  const d = item?.details ?? {};
  const [fields, setFields] = useState<FormFields>({
    airline: d.airline ?? "", flightNumber: d.flightNumber ?? "", from: d.from ?? "", to: d.to ?? "", rideType: d.rideType ?? "driving",
    place: d.place ?? "", seats: d.seats !== undefined ? String(d.seats) : "", name: d.name ?? "", note: d.note ?? "",
    startsAt: item?.startsAt ?? "", endsAt: item?.endsAt ?? "",
  });
  const [problems, setProblems] = useState<ReturnType<typeof checkTravelInput>>({});
  const set = (key: keyof FormFields) => (value: string) => setFields((current) => ({ ...current, [key]: value }));
  const rental = kind === "ride" && fields.rideType === "rental";

  function save() {
    const raw: TravelDetails = { airline: fields.airline, flightNumber: fields.flightNumber, from: fields.from, to: fields.to, rideType: fields.rideType,
      place: fields.place, seats: fields.seats.trim() === "" ? undefined : Number(fields.seats), name: fields.name, note: fields.note };
    const endsAt = fields.endsAt || undefined;
    const found = checkTravelInput(kind, raw, fields.startsAt, endsAt);
    setProblems(found);
    if (Object.keys(found).length === 0) onSave(cleanDetails(kind, raw), fields.startsAt, endsAt);
  }

  const title = `${item ? "Edit" : "Add"} ${kind === "ride" ? "ride" : ITINERARY_KIND_LABEL[kind].toLowerCase()}`;
  return <GolfTripActionSheet label={title} onClose={onCancel} className={styles.sheet}>
    <h2 className={styles.title}>{title}</h2>
    <div className={styles.fields}>
      {kind === "flight" && <>
        <Field label="Airline" value={fields.airline} onChange={set("airline")} placeholder="American Airlines" />
        <Field label="Flight number" value={fields.flightNumber} onChange={set("flightNumber")} placeholder="AA1234" problem={problems.flightNumber} upper />
        <div className={styles.pair}>
          <Field label="From" value={fields.from} onChange={set("from")} placeholder="RDU" problem={problems.from} upper />
          <Field label="To" value={fields.to} onChange={set("to")} placeholder="PHX" problem={problems.to} upper />
        </div>
        <Field label="Departs" type="datetime-local" value={fields.startsAt} onChange={set("startsAt")} problem={problems.startsAt} />
        <Field label="Lands (optional)" type="datetime-local" value={fields.endsAt} onChange={set("endsAt")} problem={problems.endsAt} />
      </>}
      {kind === "ride" && <>
        <div className={styles.choice} role="group" aria-label="Ride type">
          {(["driving", "rental"] as const).map((type) => <button key={type} type="button" aria-pressed={fields.rideType === type} onClick={() => set("rideType")(type)}>
            {type === "driving" ? "I'm driving" : "Rental car"}</button>)}
        </div>
        {rental
          ? <Field label="Pickup at" value={fields.place} onChange={set("place")} placeholder="PHX Rental Car Center" />
          : <div className={styles.pair}>
            <Field label="Driving from" value={fields.from} onChange={set("from")} placeholder="Tucson" problem={problems.from} />
            <Field label="To (optional)" value={fields.to} onChange={set("to")} placeholder="Scottsdale" />
          </div>}
        <Field label={rental ? "Pickup" : "Leaving"} type="datetime-local" value={fields.startsAt} onChange={set("startsAt")} problem={problems.startsAt} />
        <Field label={rental ? "Return (optional)" : "Heading back (optional)"} type="datetime-local" value={fields.endsAt} onChange={set("endsAt")} problem={problems.endsAt} />
        <Field label="Open seats (optional)" type="number" value={fields.seats} onChange={set("seats")} placeholder="2" problem={problems.seats} />
      </>}
      {kind === "lodging" && <>
        <Field label="Where you're staying" value={fields.name} onChange={set("name")} placeholder="The Shorebreak Villas" problem={problems.name} />
        <Field label="Area or address (optional)" value={fields.place} onChange={set("place")} placeholder="Scottsdale" />
        <Field label="Check-in" type="datetime-local" value={fields.startsAt} onChange={set("startsAt")} problem={problems.startsAt} />
        <Field label="Check-out (optional)" type="datetime-local" value={fields.endsAt} onChange={set("endsAt")} problem={problems.endsAt} />
      </>}
      {kind === "other" && <>
        <Field label="What" value={fields.name} onChange={set("name")} placeholder="Spa appointment" problem={problems.name} />
        <Field label="When" type="datetime-local" value={fields.startsAt} onChange={set("startsAt")} problem={problems.startsAt} />
        <Field label="Where (optional)" value={fields.place} onChange={set("place")} placeholder="Hotel spa" />
        <Field label="Note (optional)" value={fields.note} onChange={set("note")} placeholder="Booked for 2" />
      </>}
    </div>
    <div className={styles.actions}>
      <button type="button" className={styles.cancel} onClick={onCancel}>Cancel</button>
      <button type="button" className={styles.save} onClick={save}>Save</button>
    </div>
  </GolfTripActionSheet>;
}

function Field({ label, value, onChange, type = "text", placeholder, problem, upper = false }: {
  label: string; value: string; onChange: (value: string) => void; type?: "text" | "number" | "datetime-local"; placeholder?: string; problem?: string; upper?: boolean;
}): ReactNode {
  return <label className={styles.field}>
    <span className={styles.label}>{label}</span>
    <input className={styles.input} type={type} value={value} placeholder={placeholder} aria-invalid={problem ? true : undefined}
      inputMode={type === "number" ? "numeric" : undefined} min={type === "number" ? 0 : undefined} max={type === "number" ? 12 : undefined}
      style={upper ? { textTransform: "uppercase" } : undefined} onChange={(event) => onChange(event.target.value)} />
    {problem && <span className={styles.problem} role="alert">{problem}</span>}
  </label>;
}
