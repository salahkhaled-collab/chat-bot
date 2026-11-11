import gymData from "../../data/gym.json";

export type Gym = typeof gymData;
export const gym: Gym = gymData;

export function money(n: number): string {
  return `${n.toLocaleString("en-US")} ${gym.currency}`;
}

export function gymFacts(): string {
  return [
    `Gym: ${gym.name}, ${gym.address}. Phone ${gym.phone}.`,
    `Hours: ${gym.hours.map((h) => `${h.days} ${h.open}–${h.close}`).join("; ")}.`,
    `Plans: ${gym.plans.map((p) => `${p.name} ${money(p.price)} per ${p.period} (${p.perks.join(", ")})`).join("; ")}.`,
    `Free trial: ${gym.trial}`,
    `Freeze: ${gym.freeze}`,
    `Classes: ${gym.classes.map((c) => `${c.name} on ${c.schedule} with ${c.coach}`).join("; ")}.`,
    `Trainers: ${gym.trainers.map((t) => `${t.name} (${t.focus})`).join("; ")}.`,
    gym.personalTraining,
  ].join("\n");
}
