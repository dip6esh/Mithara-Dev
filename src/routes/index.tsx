import { createFileRoute, Link } from "@tanstack/react-router";
import { HeroSlideshow } from "../components/HeroSlideshow";
import kunafaImg from "../assets/hero/Kunafa_hero_1.jpg";
import baklavaImg from "../assets/hero/Baklava_hero_1.jpg";
import { ArrowUpRight } from "lucide-react";
import { Reveal, Parallax, Tilt, ScrollWords, CountUp, ScrollMarquee } from "../lib/motion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mithara — Premium Dessert House | Kunafa & Baklava" },
      {
        name: "description",
        content:
          "Mithara is a premium dessert house. Dessert by Desert People. Made for the sweet moments. Golden kunafa and layered baklava.",
      },
      { property: "og:title", content: "Mithara — Premium Dessert House" },
      {
        property: "og:description",
        content:
          "Dessert by Desert People. Made for the sweet moments. Kunafa and baklava crafted with care.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const FLAVOURS = ["Pistachio", "Saffron", "Rose", "Biscoff", "Nutella", "Rabdi", "Honey", "Kataifi", "Caramel", "Almond"];

function HomePage() {
  return (
    <>
      {/* Hero. Mobile: a large arch with the headline laid over it, copy + CTAs just below.
          md+: the original two-column layout with the arch. The text wrapper uses `contents` on mobile so
          the headline group can share a grid cell with the image without duplicating any markup. */}
      <section className="relative overflow-hidden border-b border-border/40 bg-[#302844]">
        <div aria-hidden="true" className="bg-pattern fade-mask absolute inset-0" />
        <div aria-hidden="true" className="absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full bg-accent/20 blur-[120px]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-0 px-5 pb-10 pt-6 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:gap-10 md:py-20">
          <div className="max-md:contents md:order-1 md:text-left">
            {/* Headline group: overlays the bottom of the image on mobile, clear of the caption and dots */}
            <div className="hero-head pointer-events-none z-20 px-4 pb-28 text-center max-md:col-start-1 max-md:row-start-1 max-md:self-end md:pointer-events-auto md:px-0 md:pb-0 md:text-left">
              <p className="hero-in text-sm tracking-[0.3em] text-accent" style={{ "--d": "100ms" } as React.CSSProperties}>
                A premium dessert house
              </p>
              <h1 className="mt-3 font-serif text-6xl font-light leading-[0.95] sm:text-8xl md:mt-4 lg:text-[9rem]">
                <span className="rise"><span style={{ "--d": "250ms" } as React.CSSProperties}>Mithara</span></span>
              </h1>
              <p className="mt-3 font-serif text-2xl italic text-gold-light sm:text-3xl">
                <span className="rise"><span style={{ "--d": "500ms" } as React.CSSProperties}>Dessert by Desert People.</span></span>
              </p>
            </div>

            <div className="pt-9 text-center max-md:row-start-2 md:px-0 md:pt-0 md:text-left">
              <p className="hero-in mx-auto mt-0 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg md:mx-0 md:mt-6" style={{ "--d": "750ms" } as React.CSSProperties}>
                Some desserts are made to be eaten. Some are made to be remembered. At Mithara, we
                bring together the rich dessert traditions of the desert with a modern touch — from
                golden kunafa to delicate layered baklava.
              </p>
              <div className="hero-in mt-7 flex flex-wrap justify-center gap-3 md:mt-8 md:justify-start md:gap-4" style={{ "--d": "950ms" } as React.CSSProperties}>
                <Link to="/kunafa" className="btn-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3.5 font-medium text-gold-foreground shadow-elegant sm:px-8 sm:py-4">
                  Explore the collection <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link to="/about" className="btn-ghost inline-flex items-center rounded-full border border-accent/50 px-8 py-4 font-medium text-foreground hover:bg-accent/10">
                  Our story
                </Link>
              </div>
            </div>
          </div>

          <div className="relative max-md:col-start-1 max-md:row-start-1 sm:mx-auto sm:w-full sm:max-w-md md:order-2 md:max-w-none">
            <Parallax speed={0.05} className="hero-parallax">
              <div aria-hidden="true" className="arch absolute -inset-2 translate-x-2 translate-y-2 border border-accent/40 md:-inset-3 md:translate-x-4 md:translate-y-4" />
              <div className="arch relative h-[66svh] max-h-[40rem] min-h-[26rem] overflow-hidden border border-accent/30 shadow-elegant md:aspect-[6/7] md:h-auto md:max-h-none md:min-h-0">
                <HeroSlideshow />
              </div>
            </Parallax>
            <div aria-hidden="true" className="float absolute -bottom-6 -left-10 hidden md:block">
              <svg viewBox="0 0 120 120" className="spin-slow h-28 w-28 rounded-full bg-[#1c1733]/90 p-1 text-accent shadow-elegant sm:h-32 sm:w-32">
                  <defs><path id="circ" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" /></defs>
                  <text fontSize="9.5" letterSpacing="3" fill="currentColor"><textPath href="#circ">MADE FOR THE SWEET MOMENTS • MADE FOR THE SWEET MOMENTS •</textPath></text>
                  <circle cx="60" cy="60" r="6" fill="currentColor" />
                </svg>
            </div>
          </div>
        </div>
      </section>

      {/* One flavour strip. Moves with scroll, so it reverses when you scroll up. */}
      <div aria-hidden="true" className="overflow-hidden border-b border-border/40 bg-[#1c1733] py-5">
        <ScrollMarquee className="gap-10 font-serif text-3xl font-light italic text-accent/80 sm:text-4xl">
          {[...FLAVOURS, ...FLAVOURS, ...FLAVOURS, ...FLAVOURS].map((f, i) => (
            <span key={i} className="flex items-center gap-10 whitespace-nowrap">
              {f} <span className="text-base text-accent/40">✦</span>
            </span>
          ))}
        </ScrollMarquee>
      </div>

      {/* Collections: both visible at once, no sideways scrolling */}
      <section className="bg-[#282345] py-14 md:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <h2 className="max-w-2xl font-serif text-3xl font-light sm:text-5xl md:text-6xl">Two distinct traditions of indulgence</h2>
          </Reveal>
          <div className="mt-10 grid gap-8 md:mt-14 md:grid-cols-2 md:gap-10">
            {COLLECTIONS.map((c, i) => (
              <Reveal key={c.to} variant={i === 0 ? "left" : "right"} delay={i * 100} className={i === 1 ? "md:mt-16" : ""}>
                <Tilt>
                  <Link to={c.to} aria-label={`Explore ${c.title}`} className="group relative block overflow-hidden rounded-[2rem] border border-border/70 shadow-soft">
                    <div className="aspect-[4/5] overflow-hidden sm:aspect-[4/4.4]">
                      <img src={c.image} alt={c.alt} width={1024} height={768} loading="lazy" className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-110" />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1c1733] via-[#1c1733]/30 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 sm:p-8">
                      <div>
                        <h3 className="font-serif text-4xl font-light sm:text-5xl">{c.title}</h3>
                        <p className="mt-2 text-muted-foreground">{c.tagline}</p>
                      </div>
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-gold text-gold-foreground transition-transform duration-500 group-hover:rotate-45 group-hover:scale-110"><ArrowUpRight className="h-6 w-6" /></span>
                    </div>
                  </Link>
                </Tilt>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Made with care: scroll-lit statement + counters */}
      <section className="relative overflow-hidden border-y border-border/40 bg-[#302844] py-20 md:py-32">
        <div aria-hidden="true" className="bg-pattern fade-mask absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="font-serif text-3xl font-light text-gold-light sm:text-5xl">
            Good ingredients. The right technique. Enough time.
          </h2>
          <ScrollWords
            className="mt-8 font-serif text-2xl font-light leading-snug sm:text-4xl"
            text="At Mithara, we believe great desserts don't need to be complicated. They need good ingredients, the right technique and enough time to get things right. From the first layer to the last bite, every Mithara dessert is made with care."
          />
          <dl className="mt-14 grid grid-cols-3 gap-4 border-t border-accent/30 pt-8 text-center">
            {STATS.map((s) => (
              <div key={s.label} className="flex flex-col">
                <dt className="order-2 mt-1 text-xs text-muted-foreground sm:text-sm">{s.label}</dt>
                <dd className="font-serif text-5xl font-light text-accent sm:text-7xl"><CountUp to={s.n} /></dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Story */}
      <section className="bg-[#282345] py-16 md:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 md:grid-cols-2 md:gap-16">
          <Reveal>
            <h2 className="font-serif text-3xl font-light sm:text-5xl md:text-6xl">Dessert by Desert People</h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              Our story begins with an appreciation for the desserts, flavours and traditions that
              have travelled across generations. Mithara brings those inspirations together in a
              collection made for today.
            </p>
            <Link to="/about" className="btn-gold mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-gold px-8 py-4 font-medium text-gold-foreground shadow-elegant">
              Read our story <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Reveal>
          <Reveal variant="scale" delay={150}>
            <figure className="relative overflow-hidden rounded-[2rem] border border-accent/40 bg-[#302844] p-8 shadow-soft sm:p-12">
              <span aria-hidden="true" className="absolute -top-6 left-6 font-serif text-[10rem] leading-none text-accent/20">“</span>
              <blockquote className="relative font-serif text-2xl font-light italic leading-relaxed sm:text-3xl">
                Some desserts are made to be eaten. Some are made to be remembered.
              </blockquote>
              <figcaption className="mt-6 text-accent">— Mithara</figcaption>
            </figure>
          </Reveal>
        </div>
      </section>
    </>
  );
}

const STATS = [
  { n: 12, label: "kunafa flavours" },
  { n: 6, label: "baklava styles" },
  { n: 40, label: "layers of phyllo" },
];

const COLLECTIONS = [
  {
    to: "/kunafa" as const,
    label: "Kunafa",
    title: "Kunafa",
    tagline: "Golden. Warm. Irresistible.",
    image: kunafaImg,
    alt: "A slice of Mithara kunafa being lifted from a speckled plate, with melted white cheese stretching out from golden crisp kataifi under crushed pistachios.",
  },
  {
    to: "/baklava" as const,
    label: "Baklava",
    title: "Baklava",
    tagline: "Layer upon layer of indulgence.",
    image: baklavaImg,
    alt: "An open navy Mithara gift box with a starlit lid, holding a gold tray of assorted baklava, kataifi nests and rolls.",
  },
];
