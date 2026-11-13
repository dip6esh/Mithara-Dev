import * as React from "react";
import { Link } from "@tanstack/react-router";
import { AllergenBadges } from "./AllergenBadges";
import { useVoice } from "../voice/VoiceHostProvider";
import { EnquiryControl } from "./EnquiryControl";
import { ZoomIn } from "lucide-react";
import { Reveal, Parallax, Tilt, ScrollMarquee } from "../lib/motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

export type MenuItem = {
  name: string;
  description: string;
  ingredients: string[];
  allergens: string[];
  price: string;
  topping?: string;
  weight?: string;
  image?: string;
  imageAlt?: string;
};

export type MenuDefaults = {
  dietary?: string[];
  temperature?: string;
  shelfLife?: string;
  storage?: string;
};

/** Extract only the numeric portion from a simple price string.
 *  "₹700" / "₹ 750/-" → "700" / "750"
 */
function priceNumber(price: string): string {
  return price.replace(/[₹,/\-\s]/g, "").trim();
}

/** Convert a weight string to a speakable form.
 *  "200g" / "200 grams" → "200"
 *  "165 grams - 175 grams" → "165 से 175"
 */
function weightNumber(weight: string): string {
  const rangeMatch = weight.match(/(\d+(?:\.\d+)?)\s*(?:grams?|g)?\s*[-–]\s*(\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    return `${rangeMatch[1]} से ${rangeMatch[2]}`;
  }
  return weight.replace(/[^0-9.]/g, "").trim();
}

/** Clean and phonetically adapt text for voice synthesis. */
function cleanForSpeech(text: string): string {
  return text.replace(/\bRocher\b/gi, "Rosher").replace(/&/g, "and");
}

function buildItemSpeech(item: MenuItem): string {
  // Detect tiered pricing: "6pc/9pc/12pc/18pc - ₹700/₹975/₹1225/₹1800"
  const tieredMatch = item.price.match(/^(.+?)\s*-\s*(.+)$/);
  let priceSentence: string;

  if (tieredMatch && tieredMatch[1].includes("/") && tieredMatch[2].includes("/")) {
    const qtys = tieredMatch[1].split("/").map((q) => q.trim().replace(/[^0-9]/g, ""));
    const amounts = tieredMatch[2].split("/").map((a) => a.trim().replace(/[₹,\s]/g, ""));
    const tiers = qtys.map((q, i) => `${q} पीस के लिए ${amounts[i]} रुपये`);
    const last = tiers.pop()!;
    priceSentence = `यह ${tiers.join(", ")}, और ${last} में मिलता है.`;
  } else {
    priceSentence = `इसकी कीमत ${priceNumber(item.price)} रुपये है.`;
  }

  const spokenName = cleanForSpeech(item.name);
  let speech = `आपने ${spokenName} पर क्लिक किया है. ${priceSentence}`;

  if (item.topping && item.weight) {
    speech += ` इसमें topping ${cleanForSpeech(item.topping)} का होता है, और इसका वज़न करीब ${weightNumber(item.weight)} ग्राम होता है.`;
  } else if (item.topping) {
    speech += ` इसमें topping ${cleanForSpeech(item.topping)} का होता है.`;
  } else if (item.weight) {
    speech += ` इसका वज़न करीब ${weightNumber(item.weight)} ग्राम होता है.`;
  }

  return speech;
}

function PriceDisplay({ price, labelId }: { price: string; labelId: string }) {
  // Parse tiered prices like "6pc/9pc/12pc/18pc - ₹700/₹975/₹1225/₹1800"
  const match = price.match(/^(.+?)\s*-\s*(.+)$/);
  let tiers: { qty: string; amount: string }[] | null = null;
  if (match && match[1].includes("/") && match[2].includes("/")) {
    const qtys = match[1].split("/").map((s) => s.trim());
    const amounts = match[2].split("/").map((s) => s.trim());
    if (qtys.length === amounts.length) {
      tiers = qtys.map((qty, i) => ({ qty, amount: amounts[i] }));
    }
  }

  if (tiers) {
    return (
      <ul
        className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
        aria-label={`Price options for ${labelId}`}
      >
        {tiers.map((t) => (
          <li
            key={t.qty}
            className="inline-flex items-center justify-between sm:justify-start gap-1.5 rounded-full border border-accent/40 bg-background px-3 py-1 text-xs sm:text-sm"
          >
            <span className="text-muted-foreground">{t.qty}</span>
            <span className="font-semibold text-accent">{t.amount}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <span
      className="mt-4 inline-flex w-fit items-center rounded-full bg-gradient-gold px-4 py-1.5 text-sm font-semibold text-gold-foreground"
      aria-label={`Price ${price}`}
    >
      {price}
    </span>
  );
}

function MenuGrid({ menu, category }: { menu: MenuItem[]; category: string }) {
  const { enabled, speakNow, status } = useVoice();
  const [previewItem, setPreviewItem] = React.useState<MenuItem | null>(null);
  // Which card was tapped last, so it can light up right away (before the voice has started).
  const [tappedName, setTappedName] = React.useState<string | null>(null);
  const tapCard = (item: MenuItem) => {
    setTappedName(item.name);
    speakNow(buildItemSpeech(item));
  };

  return (
    <>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {menu.map((item, index) => (
          <Reveal key={item.name} variant={index % 2 === 0 ? "from-left" : "from-right"} className="flex">
          <Tilt className="flex w-full" max={3}>
          <article
            className={[
              "group flex w-full select-none flex-col justify-between rounded-3xl border border-border/80 bg-[#302844] p-5 shadow-soft sm:p-6 md:p-8 transition-all duration-300 hover:border-accent/50",
              enabled
                ? "cursor-pointer hover:border-accent/60 active:scale-[0.98] [&:has(button:active)]:scale-100"
                : "",
              enabled && status === "speaking" && tappedName === item.name
                ? "border-accent ring-2 ring-accent/60"
                : "",
            ].join(" ")}
            aria-labelledby={`menu-item-${index}-name`}
            role={enabled ? "button" : undefined}
            tabIndex={enabled ? 0 : undefined}
            aria-label={enabled ? `Tap to hear about ${item.name}` : undefined}
            onClick={enabled ? () => tapCard(item) : undefined}
            onKeyDown={
              enabled
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      tapCard(item);
                    }
                  }
                : undefined
            }
          >
            <div>
              {item.image && (
                <div
                  className="group/img relative mb-4 sm:mb-6 overflow-hidden rounded-2xl border border-border/40 bg-background/30 aspect-[4/3] cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewItem(item);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`View full image for ${item.name}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setPreviewItem(item);
                    }
                  }}
                >
                  <img
                    src={item.image}
                    alt={item.imageAlt || item.name}
                    loading="lazy"
                    draggable={false}
                    className="pointer-events-none h-full w-full select-none object-cover transition-transform duration-500 ease-out group-hover/img:scale-105 [-webkit-touch-callout:none] [-webkit-user-drag:none]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/img:opacity-100" />
                  <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-border/50 bg-[#1f1a38]/85 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-md shadow-md transition-all group-hover/img:bg-[#1f1a38] group-hover/img:text-accent group-hover/img:border-accent/60">
                    <ZoomIn className="h-3.5 w-3.5 text-accent" />
                    <span>View photo</span>
                  </span>
                </div>
              )}
              <h3 id={`menu-item-${index}-name`} className="font-serif text-2xl text-foreground">
                {item.name}
              </h3>
              <PriceDisplay price={item.price} labelId={item.name} />
              <p className="mt-3 text-muted-foreground">{item.description}</p>
            </div>

            <dl className="mt-6 grid gap-4 text-sm">
              <div>
                <dt className="font-medium text-foreground">Ingredients</dt>
                <dd className="mt-1 text-muted-foreground">{item.ingredients.join(", ")}.</dd>
              </div>

              <AllergenBadges allergens={item.allergens} />

              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {item.topping && (
                  <div>
                    <dt className="font-medium text-foreground">Topping</dt>
                    <dd className="mt-1 text-muted-foreground">{item.topping}</dd>
                  </div>
                )}
                {item.weight && (
                  <div>
                    <dt className="font-medium text-foreground">Weight</dt>
                    <dd className="mt-1 text-muted-foreground">{item.weight}</dd>
                  </div>
                )}
              </div>
            </dl>

            {/* Add-to-enquiry icon: bottom-right corner of the card. It lives in its own footer row, and the
                card is a flex column, so it lines up at the same spot on every card in a row. */}
            <div className="mt-5 flex justify-end">
              <EnquiryControl name={item.name} price={item.price} category={category} />
            </div>
          </article>
          </Tilt>
          </Reveal>
        ))}
      </div>

      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] sm:w-full border-border/60 bg-[#282345] p-5 sm:p-6 text-foreground rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl sm:text-3xl text-foreground">
              {previewItem?.name}
            </DialogTitle>
            {previewItem?.description && (
              <DialogDescription className="text-sm sm:text-base text-muted-foreground">
                {previewItem.description}
              </DialogDescription>
            )}
          </DialogHeader>
          {previewItem?.image && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-border/40 bg-background/40">
              <img
                src={previewItem.image}
                alt={previewItem.imageAlt || previewItem.name}
                className="mx-auto max-h-[60vh] sm:max-h-[70vh] w-full object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProductDetail({
  title,
  image,
  alt,
  focus = "50% 50%",
  subtitle,
  description,
  items,
  care,
  menu,
  menuDefaults,
  menuNotes,
}: {
  title: string;
  image: string;
  alt: string;
  /** object-position for the tall mobile crop (a phone arch shows ~60% of the square photo) */
  focus?: string;
  subtitle: string;
  description: string;
  items?: { name: string; description: string; serves: string }[];
  care: string;
  menu?: MenuItem[];
  menuDefaults?: MenuDefaults;
  menuNotes?: string[];
}) {
  return (
    <article className="overflow-hidden">
      {/* Product Hero Banner. Mobile: large arch with the title laid over it, copy + CTA below.
          md+: two columns. The text wrapper uses `contents` on mobile so the title group can share
          a grid cell with the arch without duplicating any markup. */}
      <section className="relative overflow-hidden border-b border-border/40 bg-[#302844] pb-10 pt-6 md:py-20">
        <div aria-hidden="true" className="bg-pattern fade-mask absolute inset-0" />
        <div aria-hidden="true" className="absolute -right-32 -top-32 h-[480px] w-[480px] rounded-full bg-accent/20 blur-[120px]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-0 px-5 sm:px-6 md:grid-cols-2 md:gap-12">
          <Parallax speed={0.05} className="relative max-md:col-start-1 max-md:row-start-1 sm:mx-auto sm:w-full sm:max-w-md md:max-w-none">
            <div aria-hidden="true" className="arch absolute -inset-2 translate-x-2 translate-y-2 border border-accent/40 md:hidden" />
            <div className="arch relative h-[62svh] max-h-[38rem] min-h-[24rem] overflow-hidden border border-accent/40 shadow-elegant md:aspect-[4/5] md:h-auto md:max-h-none md:min-h-0">
              <img
                src={image}
                alt={alt}
                width={1024}
                height={1024}
                className="hshow-img h-full w-full object-cover md:scale-110"
                style={{ "--pos-m": focus } as React.CSSProperties}
              />
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#1c1733]/95 via-[#1c1733]/50 to-transparent md:hidden" />
            </div>
          </Parallax>
          <div className="max-md:contents md:text-left">
            {/* Title group: overlays the bottom of the arch on mobile */}
            <div className="hero-head pointer-events-none z-20 px-4 pb-9 text-center max-md:col-start-1 max-md:row-start-1 max-md:self-end md:pointer-events-auto md:px-0 md:pb-0 md:text-left">
              <p className="hero-in mb-3 text-sm tracking-[0.3em] text-accent" style={{ "--d": "100ms" } as React.CSSProperties}>{subtitle}</p>
              <h1 className="font-serif text-6xl font-light text-foreground sm:text-7xl md:text-8xl"><span className="rise"><span style={{ "--d": "250ms" } as React.CSSProperties}>{title}</span></span></h1>
            </div>
            <div className="pt-9 text-center max-md:row-start-2 md:pt-0 md:text-left">
              <p className="hero-in mx-auto max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg md:mx-0 md:mt-6" style={{ "--d": "550ms" } as React.CSSProperties}>{description}</p>
              {menu && menu.length > 0 && (
                <a href="#menu-heading" className="btn-gold hero-in mt-8 inline-flex items-center rounded-full bg-gradient-gold px-8 py-4 font-medium text-gold-foreground shadow-elegant" style={{ "--d": "800ms" } as React.CSSProperties}>
                  See the menu
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {menu && menu.length > 0 && (
        <div aria-hidden="true" className="overflow-hidden border-b border-border/40 bg-[#1c1733] py-5">
          <ScrollMarquee className="gap-10 font-serif text-3xl font-light italic text-accent/80 sm:text-4xl">
            {[...menu, ...menu, ...menu].map((m, i) => (
              <span key={i} className="flex items-center gap-10 whitespace-nowrap">
                {m.name.replace(/ (Kunafa|Baklava)$/, "")} <span className="text-base text-accent/40">✦</span>
              </span>
            ))}
          </ScrollMarquee>
        </div>
      )}

      {items && items.length > 0 && (
        <section className="bg-[#282345] py-12 md:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="font-serif text-2xl sm:text-3xl text-foreground">House favourites</h2>
            <div className="mt-6 md:mt-8 grid gap-4 sm:gap-6 md:grid-cols-2">
              {items.map((it) => (
                <div
                  key={it.name}
                  className="rounded-3xl border border-border/80 bg-[#302844] p-6 md:p-8 shadow-soft"
                >
                  <h3 className="font-serif text-xl sm:text-2xl text-foreground">{it.name}</h3>
                  <p className="mt-2 sm:mt-3 text-sm sm:text-base text-muted-foreground">
                    {it.description}
                  </p>
                  <p className="mt-4 text-xs uppercase tracking-[0.3em] text-accent">{it.serves}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {menu && menu.length > 0 && (
        <section className="bg-[#282345] py-12 md:py-20" aria-labelledby="menu-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 id="menu-heading" className="scroll-mt-24 font-serif text-4xl font-light text-foreground sm:text-6xl">
              Menu
            </h2>
            <p className="mt-2 sm:mt-3 text-sm sm:text-base text-muted-foreground">
              Prices are in Indian Rupees. All items are handcrafted and may vary slightly in
              weight.
            </p>
            <p className="mt-2 text-sm text-accent">
              Tap <span className="font-semibold">Add to enquiry</span> on anything you like, then send your
              list to us on WhatsApp.
            </p>

            <MenuGrid menu={menu} category={title} />

            {menuDefaults && (
              <div className="mt-8 grid grid-cols-2 gap-3 rounded-2xl border border-border/80 bg-[#302844] p-4 sm:p-5 text-xs sm:text-sm text-muted-foreground lg:grid-cols-4">
                {menuDefaults.dietary && (
                  <div>
                    <dt className="font-medium text-foreground">Dietary</dt>
                    <dd className="mt-1">{menuDefaults.dietary.join(", ")}</dd>
                  </div>
                )}
                {menuDefaults.temperature && (
                  <div>
                    <dt className="font-medium text-foreground">Served</dt>
                    <dd className="mt-1">{menuDefaults.temperature}</dd>
                  </div>
                )}
                {menuDefaults.shelfLife && (
                  <div>
                    <dt className="font-medium text-foreground">Shelf life</dt>
                    <dd className="mt-1">{menuDefaults.shelfLife}</dd>
                  </div>
                )}
                {menuDefaults.storage && (
                  <div>
                    <dt className="font-medium text-foreground">Storage</dt>
                    <dd className="mt-1">{menuDefaults.storage}</dd>
                  </div>
                )}
              </div>
            )}

            {menuNotes && menuNotes.length > 0 && (
              <div className="mt-8 rounded-2xl border border-border/80 bg-[#302844] p-5 sm:p-6 text-xs sm:text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Notes</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {menuNotes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* How to enjoy */}
      <section className="relative overflow-hidden border-t border-border/40 bg-[#302844] py-16 md:py-24">
        <div aria-hidden="true" className="bg-pattern fade-mask absolute inset-0 opacity-60" />
        <Reveal variant="scale" className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="font-serif text-3xl font-light text-gold-light sm:text-5xl">How to enjoy</h2>
          <p className="mt-6 font-serif text-xl font-light leading-relaxed text-foreground sm:text-2xl">{care}</p>
          <Link to="/care" className="btn-gold mt-8 inline-flex items-center rounded-full bg-gradient-gold px-8 py-4 font-medium text-gold-foreground shadow-elegant">
            Open the full care guide
          </Link>
        </Reveal>
      </section>
    </article>
  );
}
