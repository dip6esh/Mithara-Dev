import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Mithara — Our Story" },
      {
        name: "description",
        content:
          "Mithara is a premium dessert house born from a love of celebration. Heirloom Middle-Eastern sweets, hand crafted with modern care.",
      },
      { property: "og:title", content: "About Mithara" },
      { property: "og:description", content: "A premium dessert house, born from a love of celebration." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <article className="overflow-hidden">
      {/* Header Banner */}
      <section className="border-b border-border/40 bg-[#302844] py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="mb-3 text-xs uppercase tracking-[0.4em] text-accent">Our Story</p>
          <h1 className="font-serif text-5xl text-foreground md:text-6xl">About Mithara</h1>
        </div>
      </section>

      {/* Story Content Section */}
      <section className="bg-[#282345] py-20">
        <div className="mx-auto max-w-3xl px-6 space-y-6 text-lg leading-relaxed text-foreground/90">
          <p>
            Mithara was born from a love of celebration and the rituals that surround sweetness. The
            tray brought out for guests. The first piece broken to share. The hush before the first
            bite of something perfect.
          </p>
          <p>
            The name <em>Mithara</em> means a sacred vessel — something hand-shaped to hold what
            matters. We believe a dessert is one too. So every kunafa is hand pulled. Every baklava
            is layered by hand. Every scoop of gelato is churned in small batches with the finest
            pistachios, saffron, and rose.
          </p>
          <p>
            We source nuts from family groves in Sicily and Antep, dairy from pasture-raised herds,
            and honey from single-origin apiaries. Nothing in our kitchen comes from a shortcut.
          </p>
          <p>
            We started with kunafa, baklava, and gelato because they're the desserts of celebration
            across the Levant and beyond. More will join, slowly, as we find what we're proud to put
            our name on.
          </p>
          <p className="font-serif text-2xl text-accent pt-4">
            Until then — welcome to Mithara. Help yourself.
          </p>
        </div>
      </section>

      {/* Accessibility / Voice Assistant Section */}
      <section className="border-t border-border/40 bg-[#302844] py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-accent">Built for everyone</p>
          <p className="mt-4 text-lg text-foreground">
            This site is voice enabled and designed for blind and low-vision visitors. Speak any time
            to ask about our desserts, learn how to enjoy them, or move between pages. We are
            listening.
          </p>
        </div>
      </section>
    </article>
  );
}
