import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Utensils, Package, Snowflake } from "lucide-react";
import { Reveal, ScrollLine } from "../lib/motion";

export const Route = createFileRoute("/care")({
  head: () => ({
    meta: [
      { title: "Care & Enjoyment Guide | Mithara" },
      {
        name: "description",
        content:
          "How to eat, store, and preserve every Mithara dessert — kunafa and baklava — at its very best.",
      },
      { property: "og:title", content: "Care & Enjoyment Guide" },
      {
        property: "og:description",
        content: "Serving, storage, and preservation tips for kunafa and baklava.",
      },
    ],
  }),
  component: CarePage,
});

const GLANCE: Record<string, string[]> = {
  Kunafa: ["Serve warm", "150°C · 8–10 min", "Fridge · 3 days", "Freezer · 1 month"],
  Baklava: ["Room temperature", "Sealed tin · 2 weeks", "Never refrigerate", "Freezer · 2 months"],
};

const GUIDES = [
  {
    title: "Kunafa",
    eat: "Best served warm. Heat in a low oven at 150°C for 8–10 minutes, or in the microwave for 30 seconds. Drizzle warm rose syrup on top and serve immediately so the cheese stays soft and the pastry stays crisp.",
    store: "Refrigerate in an airtight container for up to 3 days.",
    preserve:
      "Freeze unbaked kunafa for up to 1 month, wrapped tightly in cling film and foil. Thaw overnight in the fridge before warming.",
  },
  {
    title: "Baklava",
    eat: "Enjoy at room temperature with strong coffee or mint tea. Take only what you'll eat — the syrup-soaked layers are at their best the moment they're cut.",
    store:
      "Keep in a sealed tin lined with parchment at room temperature for up to 2 weeks. Do not refrigerate; the cold will make the phyllo soggy.",
    preserve:
      "Layer between parchment in an airtight container and freeze for up to 2 months. Thaw uncovered at room temperature for 1 hour before serving.",
  },
];

function CarePage() {
  const [active, setActive] = React.useState(0);
  const g = GUIDES[active];
  const steps = [
    { icon: Utensils, label: "How to eat", text: g.eat },
    { icon: Package, label: "How to store", text: g.store },
    { icon: Snowflake, label: "How to preserve", text: g.preserve },
  ];
  return (
    <article className="overflow-hidden">
      <section className="relative border-b border-border/40 bg-[#302844] py-14 md:py-24">
        <div aria-hidden="true" className="bg-pattern fade-mask absolute inset-0" />
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h1 className="font-serif text-4xl font-light sm:text-6xl md:text-7xl">Make every bite count</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground sm:text-lg">
            Pick a dessert and follow the three steps. Each one tells you exactly what to do.
          </p>
          <div role="tablist" aria-label="Choose a dessert" className="relative mx-auto mt-10 grid w-72 grid-cols-2 rounded-full border border-accent/40 bg-[#1c1733] p-1">
            <span aria-hidden="true" className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-gradient-gold transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)]" style={{ transform: `translateX(${active * 100}%)` }} />
            {GUIDES.map((x, i) => (
              <button key={x.title} role="tab" aria-selected={active === i} onClick={() => setActive(i)}
                className={`relative z-10 rounded-full py-3 font-medium transition-colors duration-300 ${active === i ? "text-gold-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {x.title}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#282345] py-14 md:py-24">
        <div key={g.title} className="page-enter mx-auto max-w-3xl px-4 sm:px-6">
          <ul aria-label={`${g.title} at a glance`} className="flex flex-wrap justify-center gap-3">
            {GLANCE[g.title].map((c, i) => (
              <li key={c} className="hero-in rounded-full border border-accent/40 bg-[#302844] px-4 py-2 text-sm text-gold-light" style={{ "--d": `${i * 90}ms` } as React.CSSProperties}>{c}</li>
            ))}
          </ul>
          <ScrollLine className="mt-14 space-y-12">
            {steps.map((st, i) => (
              <Reveal key={st.label} variant="right" delay={i * 80} className="relative pl-20">
                <span className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-full border border-accent bg-[#1c1733] text-accent shadow-soft">
                  <st.icon className="h-5 w-5" />
                </span>
                <h2 className="font-serif text-2xl font-light sm:text-3xl">{st.label}</h2>
                <p className="mt-2 leading-relaxed text-foreground/85 sm:text-lg">{st.text}</p>
              </Reveal>
            ))}
          </ScrollLine>
        </div>
      </section>

    </article>
  );
}
