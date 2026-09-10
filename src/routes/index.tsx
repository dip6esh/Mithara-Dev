import { createFileRoute, Link } from "@tanstack/react-router";
import heroImage from "../assets/hero-mithara.jpg";
import kunafaImg from "../assets/kunafa.jpg";
import baklavaImg from "../assets/baklava.jpg";

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

function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#302844] border-b border-border/40">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
          <div className="order-2 md:order-1">
            <p className="mb-6 text-xs uppercase tracking-[0.4em] text-accent">A premium dessert house</p>
            <h1 className="font-serif text-5xl leading-[1.05] text-foreground md:text-7xl lg:text-8xl">
              Mithara
            </h1>
            <p className="mt-4 font-serif text-2xl text-accent md:text-3xl">
              Dessert by Desert People.
            </p>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              Some desserts are made to be eaten. Some are made to be remembered. At Mithara, we bring
              together the rich dessert traditions of the desert with a modern touch — from golden kunafa
              to delicate layered baklava.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/kunafa"
                className="inline-flex items-center justify-center rounded-full bg-gradient-gold px-8 py-4 font-medium text-gold-foreground shadow-elegant transition-transform hover:scale-105"
              >
                Explore the collection
              </Link>
            </div>
          </div>
          <div className="relative order-1 md:order-2">
            <img
              src={heroImage}
              alt="An overhead view of Mithara's signature desserts: golden kunafa and layered pistachio baklava, garnished with crushed pistachios and gold leaf on a warm cream marble surface."
              width={1920}
              height={1080}
              className="rounded-3xl shadow-elegant border border-border/60"
            />
          </div>
        </div>
      </section>

      {/* Collections */}
      <section className="bg-[#282345] py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.4em] text-accent">Signature Collections</p>
            <h2 className="mt-3 font-serif text-4xl text-foreground md:text-5xl">
              Two distinct traditions of indulgence
            </h2>
          </div>

          <div className="mt-14 space-y-16">
            {COLLECTIONS.map((c, i) => (
              <div
                key={c.to}
                className={`grid items-center gap-10 md:grid-cols-2 ${i % 2 === 1 ? "md:flex-row-reverse" : ""}`}
              >
                <div className={`${i % 2 === 1 ? "md:order-2" : ""}`}>
                  <div className="aspect-[4/3] overflow-hidden rounded-3xl shadow-soft border border-border/60">
                    <img
                      src={c.image}
                      alt={c.alt}
                      width={1024}
                      height={768}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                    />
                  </div>
                </div>
                <div className={`${i % 2 === 1 ? "md:order-1 md:text-right" : ""}`}>
                  <p className="text-xs uppercase tracking-[0.4em] text-accent">{c.label}</p>
                  <h3 className="mt-3 font-serif text-4xl text-foreground md:text-5xl">{c.title}</h3>
                  <p className="mt-4 text-lg text-muted-foreground">{c.tagline}</p>
                  <div className={`mt-8 ${i % 2 === 1 ? "md:flex md:justify-end" : ""}`}>
                    <Link
                      to={c.to}
                      className="inline-flex items-center justify-center rounded-full border border-border/80 bg-[#302844] px-8 py-3.5 font-medium text-foreground transition-all hover:bg-accent hover:text-accent-foreground hover:border-accent"
                    >
                      Explore
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Made with care */}
      <section className="border-y border-border/40 bg-[#302844] py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="mb-4 text-xs uppercase tracking-[0.4em] text-accent">Made with care</p>
          <h2 className="font-serif text-3xl text-foreground md:text-4xl">
            Good ingredients. The right technique. Enough time.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            At Mithara, we believe great desserts don't need to be complicated. They need good
            ingredients, the right technique and enough time to get things right. From the first layer to
            the last bite, every Mithara dessert is made with care.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="bg-[#282345] py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-accent">Our story</p>
              <h2 className="mt-3 font-serif text-4xl text-foreground md:text-5xl">
                Dessert by Desert People
              </h2>
              <p className="mt-6 text-lg text-muted-foreground">
                Our story begins with an appreciation for the desserts, flavours and traditions that have
                travelled across generations. Mithara brings those inspirations together in a collection made
                for today.
              </p>
              <div className="mt-8">
                <Link
                  to="/about"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-gold px-8 py-4 font-medium text-gold-foreground shadow-elegant transition-transform hover:scale-105"
                >
                  Our Story
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-border/80 bg-[#302844] p-10 md:p-14 shadow-soft">
              <blockquote className="font-serif text-2xl leading-relaxed text-foreground md:text-3xl">
                "Some desserts are made to be eaten. Some are made to be remembered."
              </blockquote>
              <p className="mt-6 text-sm uppercase tracking-[0.3em] text-accent">— Mithara</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

const COLLECTIONS = [
  {
    to: "/kunafa" as const,
    label: "Kunafa",
    title: "Kunafa",
    tagline: "Golden. Warm. Irresistible.",
    image: kunafaImg,
    alt: "A square of golden Mithara kunafa on a cream plate, topped with crushed bright green pistachios and drizzled with rose syrup.",
  },
  {
    to: "/baklava" as const,
    label: "Baklava",
    title: "Baklava",
    tagline: "Layer upon layer of indulgence.",
    image: baklavaImg,
    alt: "A stacked piece of Mithara baklava on a decorative gold-rimmed plate, glistening with honey and topped with chopped pistachios and walnuts.",
  },
];
