import { z } from "zod";
import type { PushKind } from "@/lib/push-message";

// Push-notiser (Story 23.3): what a person can choose and the shape of a
// device. Pure and client-safe. What a notification says is in
// src/lib/push-message.ts, and sending is in src/lib/push-send.ts.

export type PushPreferences = Record<PushKind, boolean>;

/** The choices before anyone has made one: the list and the notes on, the rest off. */
export const defaultPushPreferences: PushPreferences = { lista: true, forrad: false, matsedel: false, lappar: true };

export const pushPreferencesSchema = z.object({
  lista: z.boolean(),
  forrad: z.boolean(),
  matsedel: z.boolean(),
  lappar: z.boolean(),
});

/** The label and hint of each choice in Inställningar → Notiser. */
export const pushChoices: readonly { kind: PushKind; label: string; hint: string }[] = [
  { kind: "lista", label: "Nya varor på listan", hint: "När någon annan lägger till något." },
  { kind: "lappar", label: "Lappar", hint: "När någon skriver en lapp till hushållet." },
  { kind: "forrad", label: "Nya kort i Förråd", hint: "När någon annan fotograferar något nytt." },
  { kind: "matsedel", label: "Ändrad matsedel", hint: "När någon annan lägger till, tar bort eller flyttar en rätt." },
];

/** A device's push subscription, as the browser hands it over. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(200),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
