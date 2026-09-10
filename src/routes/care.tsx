import { createFileRoute } from "@tanstack/react-router";

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

const GUIDES = [
  {
    title: "Kunafa",
    eat: "Best served warm. Heat in a low oven at 150°C for 8–10 minutes, or in the microwave for 30 seconds. Drizzle warm rose syrup on top and serve immediately so the cheese stays soft and the pastry stays crisp.",
    store: "Refrigerate in an airtight container for up to 3 days.",
    preserve: "Freeze unbaked kunafa for up to 1 month, wrapped tightly in cling film and foil. Thaw overnight in the fridge before warming.",
  },
  {
    title: "Baklava",
    eat: "Enjoy at room temperature with strong coffee or mint tea. Take only what you'll eat — the syrup-soaked layers are at their best the moment they're cut.",
    store: "Keep in a sealed tin lined with parchment at room temperature for up to 2 weeks. Do not refrigerate; the cold will make the phyllo soggy.",
    preserve: "Layer between parchment in an airtight container and freeze for up to 2 months. Thaw uncovered at room temperature for 1 hour before serving.",
  },
];

function CarePage() {
  return (
    <article className="overflow-hidden">
      {/* Header Banner */}
      <section className="border-b border-border/40 bg-[#302844] py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="mb-3 text-xs uppercase tracking-[0.4em] text-accent">Care & Enjoyment</p>
          <h1 className="font-serif text-5xl text-foreground md:text-6xl">Make every bite count</h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Every Mithara dessert deserves a moment. Here's how to serve, store, and preserve each
            one at its very best.
          </p>
        </div>
      </section>

      {/* Guides Section */}
      <section className="bg-[#282345] py-20">
        <div className="mx-auto max-w-4xl px-6 space-y-12">
          {GUIDES.map((g) => (
            <div key={g.title} className="rounded-3xl border border-border/80 bg-[#302844] p-8 shadow-soft md:p-12">
              <h2 className="font-serif text-4xl text-foreground">{g.title}</h2>

              <div className="mt-8 grid gap-8 md:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-accent">How to eat</p>
                  <p className="mt-3 text-foreground/90">{g.eat}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-accent">How to store</p>
                  <p className="mt-3 text-foreground/90">{g.store}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-accent">How to preserve</p>
                  <p className="mt-3 text-foreground/90">{g.preserve}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Voice Assistant Section */}
      <section className="border-t border-border/40 bg-[#302844] py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-accent">Ask out loud</p>
          <p className="mt-4 text-lg text-foreground">
            Say <strong>"how do I store baklava"</strong> or <strong>"how do I eat kunafa"</strong> and your guide will read these instructions aloud.
          </p>
        </div>
      </section>
    </article>
  );
}
