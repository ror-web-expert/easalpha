"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { CONTACT, mailtoLink, type SiteContact } from "./site-helpers";

const TOPICS = ["Book a demo", "Pricing and plans", "Moving from another POS", "Help with my account", "Something else"];

/** Opens the visitor's mail app with a prefilled message. No backend involved. */
export function ContactForm({ contact = CONTACT }: { contact?: SiteContact }) {
  const [name, setName] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = [`Name: ${name}`, `Restaurant: ${restaurant}`, `Phone: ${phone}`, "", message].join("\n");
    window.location.href = mailtoLink(`${topic} - ${restaurant || name}`, body, contact);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required className="h-11" /></Field>
        <Field label="Restaurant"><Input value={restaurant} onChange={(e) => setRestaurant(e.target.value)} autoComplete="organization" className="h-11" /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone or WhatsApp"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+92 300 1234567" className="h-11" /></Field>
        <Field label="Topic"><Select value={topic} onChange={(e) => setTopic(e.target.value)} className="h-11">{TOPICS.map((t) => <option key={t}>{t}</option>)}</Select></Field>
      </div>
      <Field label="Message"><Textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={5} placeholder="Tell us about your restaurant: branches, tills, what you use today." /></Field>
      <Button type="submit" size="lg" className="w-full bg-brand-cta font-semibold text-white hover:bg-brand-cta-hover sm:w-auto"><Send className="h-4 w-4" />Open in my mail app</Button>
      <p className="text-xs text-slate-500">This opens your email app with the message filled in. Nothing is sent until you press send there.</p>
    </form>
  );
}
