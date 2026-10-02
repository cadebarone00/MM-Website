"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { FLIGHT_DIRECTIONS, flightInputFromBody, flightTime, groupFlights, type FlightDirection, type GolfTripFlight } from "@/lib/platform/golfTripFlights";
import { Card, Empty } from "./GolfTripHome";
import home from "./GolfTripHome.module.css";
import fields from "./CreateTournament.module.css";
import styles from "./GolfTripFlights.module.css";

type Editing = { flight: GolfTripFlight | null; direction: FlightDirection };

/**
 * Golf Trip Info → Flights: your own flights on this trip, typed in by hand, grouped Getting There / Heading Home
 * (connections are just more flights in a group, in departure order). Add, edit and delete them here.
 * `available` is false when flights can't be loaded (golf_trip_flights.sql not installed): the page says so.
 */
export function GolfTripFlights({ tripId, backHref, initialFlights, available }:
  { tripId: string; backHref: string; initialFlights: GolfTripFlight[]; available: boolean }) {
  const [flights, setFlights] = useState(initialFlights);
  const [editing, setEditing] = useState<Editing | null>(null);
  const groups = groupFlights(flights);

  function saved(flight: GolfTripFlight) {
    setFlights((current) => [...current.filter((f) => f.id !== flight.id), flight]);
    setEditing(null);
  }

  return <main className={home.page}>
    <header className={home.settingsHeader}>
      <Link href={backHref} className={`${home.iconButton} ${home.backButton}`} aria-label="Back to trip"><ChevronLeft size={26} strokeWidth={1.75} aria-hidden /></Link>
      <h1 className={home.settingsTitle}>Flights</h1>
      <p className={home.settingsNote}>Only you can see your flights. Times are the local times on your ticket.</p>
    </header>
    <div className={home.body}>
      {!available ? <Card title="Flights"><Empty>Saving flights isn&apos;t switched on yet.</Empty></Card>
        : editing ? <FlightForm tripId={tripId} editing={editing} onSaved={saved} onCancel={() => setEditing(null)} />
        : FLIGHT_DIRECTIONS.map(({ value, label }) => <Card key={value} title={label}>
          {groups[value].length === 0 && <Empty>{value === "arrival" ? "Add the flights that get you there" : "Add the flights that bring you home"}</Empty>}
          {groups[value].map((flight) => <FlightCard key={flight.id} tripId={tripId} flight={flight}
            onEdit={() => setEditing({ flight, direction: flight.direction })}
            onDeleted={() => setFlights((current) => current.filter((f) => f.id !== flight.id))} />)}
          <button type="button" className={styles.addButton} onClick={() => setEditing({ flight: null, direction: value })}>
            <Plus size={16} strokeWidth={2.5} aria-hidden />Add flight
          </button>
        </Card>)}
    </div>
  </main>;
}

function FlightCard({ tripId, flight, onEdit, onDeleted }: { tripId: string; flight: GolfTripFlight; onEdit: () => void; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Filled only by a future flight-data provider; manual flights show none of this.
  const live = [flight.liveStatus, flight.departureTerminal && `Terminal ${flight.departureTerminal}`, flight.departureGate && `Gate ${flight.departureGate}`].filter(Boolean).join(" · ");

  async function remove() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/golf-trips/${tripId}/flights/${flight.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (response.ok && result?.ok) return onDeleted();
      setMessage(result?.error ?? "We couldn't delete this flight. Try again.");
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
    setConfirming(false);
  }

  return <article className={styles.flight} aria-label={`${flight.flightNumber} ${flight.departureAirport} to ${flight.arrivalAirport}`}>
    <p className={styles.flightName}>{flight.flightNumber} · {flight.airline}</p>
    <p className={styles.route}>{flight.departureAirport}<span aria-hidden> → </span><span className={styles.visuallyHidden}> to </span>{flight.arrivalAirport}</p>
    <dl className={home.rows}>
      <div className={home.row}><dt>Departs</dt><dd>{flightTime(flight.departureLocal)}</dd></div>
      <div className={home.row}><dt>Arrives</dt><dd>{flightTime(flight.arrivalLocal)}</dd></div>
      {flight.confirmationNumber && <div className={home.row}><dt>Confirmation</dt><dd>{flight.confirmationNumber}</dd></div>}
    </dl>
    {flight.notes && <p className={styles.notes}>{flight.notes}</p>}
    {live && <p className={styles.notes}>{live}</p>}
    {confirming
      ? <div className={home.confirm} role="alertdialog" aria-label="Delete this flight?">
        <p className={home.text}>Delete this flight?</p>
        <div className={home.confirmActions}>
          <button type="button" className={home.cancelButton} onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
          <button type="button" className={home.deleteButton} onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete"}</button>
        </div>
      </div>
      : <div className={styles.actions}>
        <button type="button" className={home.cancelButton} onClick={onEdit}>Edit</button>
        <button type="button" className={home.dangerButton} onClick={() => { setConfirming(true); setMessage(""); }}>Delete</button>
      </div>}
    {message && <p className={home.settingsMessage} role="status">{message}</p>}
  </article>;
}

/** Add or edit one flight. The same checks as the server run on Save, so most mistakes are caught right here. */
function FlightForm({ tripId, editing, onSaved, onCancel }: { tripId: string; editing: Editing; onSaved: (flight: GolfTripFlight) => void; onCancel: () => void }) {
  const { flight } = editing;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const checked = flightInputFromBody({ ...values, id: flight?.id ?? "" });
    if (!checked.ok) return setMessage(checked.errors[0].message);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/golf-trips/${tripId}/flights`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(checked.flight) });
      const result = await response.json().catch(() => null) as { ok?: boolean; flight?: GolfTripFlight; error?: string } | null;
      if (response.ok && result?.ok && result.flight) return onSaved(result.flight);
      setMessage(result?.error ?? "We couldn't save your flight. Try again.");
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  return <Card title={flight ? "Edit flight" : "Add flight"}>
    <form className={styles.form} onSubmit={submit} noValidate>
      <fieldset className={styles.directions}>
        <legend className={fields.fieldLabel}>Which way</legend>
        {FLIGHT_DIRECTIONS.map(({ value, label }) => <label key={value} className={styles.direction}>
          <input type="radio" name="direction" value={value} defaultChecked={editing.direction === value} />{label}
        </label>)}
      </fieldset>
      <Field label="Airline" name="airline" defaultValue={flight?.airline} placeholder="American Airlines" required />
      <Field label="Flight number" name="flightNumber" defaultValue={flight?.flightNumber} placeholder="AA1234" caps required />
      <div className={fields.fieldRow}>
        <Field label="From" name="departureAirport" defaultValue={flight?.departureAirport} placeholder="DFW" maxLength={3} caps required />
        <Field label="To" name="arrivalAirport" defaultValue={flight?.arrivalAirport} placeholder="RDU" maxLength={3} caps required />
      </div>
      <Field label="Departs (local time)" name="departureLocal" type="datetime-local" defaultValue={flight?.departureLocal} required />
      <Field label="Arrives (local time)" name="arrivalLocal" type="datetime-local" defaultValue={flight?.arrivalLocal} required />
      <Field label="Confirmation number (optional)" name="confirmationNumber" defaultValue={flight?.confirmationNumber ?? ""} placeholder="ABC123" caps />
      <label className={fields.field}>
        <span className={fields.fieldLabel}>Notes (optional)</span>
        <textarea className={`${fields.input} ${styles.textarea}`} name="notes" defaultValue={flight?.notes ?? ""} maxLength={500} rows={3} />
      </label>
      {message && <p className={home.settingsMessage} role="alert">{message}</p>}
      <div className={home.confirmActions}>
        <button type="button" className={home.cancelButton} onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className={styles.saveButton} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  </Card>;
}

function Field({ label, name, type = "text", defaultValue, placeholder, maxLength, caps, required }:
  { label: string; name: string; type?: string; defaultValue?: string; placeholder?: string; maxLength?: number; caps?: boolean; required?: boolean }) {
  return <label className={fields.field}>
    <span className={fields.fieldLabel}>{label}</span>
    <input className={fields.input} type={type} name={name} defaultValue={defaultValue} placeholder={placeholder} maxLength={maxLength}
      required={required} autoComplete="off" autoCapitalize={caps ? "characters" : undefined} />
  </label>;
}
