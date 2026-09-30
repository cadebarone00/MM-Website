"use client";

import { useState, type FormEvent } from "react";

export function ContactForm() {
  const [opened, setOpened] = useState(false);
  const inputClass = "min-h-12 w-full rounded-none border border-ink-900 bg-white px-4 py-3 font-sans text-xs text-ink-900 placeholder:uppercase placeholder:text-ink-400 focus:outline-2 focus:outline-offset-2 focus:outline-maroon-700";
  function openEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = `${data.get("firstName")} ${data.get("lastName")}`.trim();
    const body = `Name: ${name}\nEmail: ${data.get("email")}\nPhone: ${data.get("phone") || "Not provided"}\n\n${data.get("message")}`;
    window.location.href = `mailto:cadebarone00@gmail.com?subject=${encodeURIComponent(`The Maroon inquiry from ${name}`)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  }
  return <form onSubmit={openEmail} className="mt-10 sm:mt-14" aria-describedby="contact-status">
    <div className="grid grid-cols-2 gap-4">
      <label><span className="sr-only">First name</span><input required maxLength={80} name="firstName" autoComplete="given-name" placeholder="First name" className={inputClass} /></label>
      <label><span className="sr-only">Last name</span><input required maxLength={80} name="lastName" autoComplete="family-name" placeholder="Last name" className={inputClass} /></label>
      <label><span className="sr-only">Email</span><input required maxLength={254} name="email" type="email" autoComplete="email" placeholder="Email" className={inputClass} /></label>
      <label><span className="sr-only">Phone (optional)</span><input maxLength={40} name="phone" type="tel" autoComplete="tel" placeholder="Phone (optional)" className={inputClass} /></label>
      <label className="col-span-2"><span className="sr-only">Message</span><textarea required maxLength={2000} name="message" rows={4} placeholder="Message" className={inputClass} /></label>
    </div>
    <p id="contact-status" className="mt-6 font-sans text-xs leading-relaxed text-ink-500">Opens your email app with your message addressed to Cade. Review it there and send when ready.</p>
    <div className="mt-8 text-center"><button type="submit" className="min-h-14 bg-maroon-900 px-12 py-4 font-condensed text-xs font-bold uppercase tracking-widest text-white hover:bg-maroon-700">Open Email</button></div>
    {opened && <p role="status" className="mt-4 font-sans text-xs leading-relaxed text-ink-500">Your message has not been sent by this website. If your email app didn’t open, email <a href="mailto:cadebarone00@gmail.com" className="underline">cadebarone00@gmail.com</a> directly.</p>}
  </form>;
}
