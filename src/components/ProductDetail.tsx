import { Link } from "@tanstack/react-router";
import { AllergenBadges } from "./AllergenBadges";
import { useVoice } from "../voice/VoiceHostProvider";

export type MenuItem = {
  name: string;
  description: string;
  ingredients: string[];
  allergens: string[];
  price: string;
  topping?: string;
  weight?: string;
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

/** Extract only the numeric portion from a weight string.
 *  "200g" / "200 grams" → "200"
 */
function weightNumber(weight: string): string {
  return weight.replace(/[^0-9.]/g, "").trim();
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
    priceSentence = `यह ${tiers.join(", ")}, और ${last} में मिलता है।`;
  } else {
    priceSentence = `इसकी कीमत ${priceNumber(item.price)} रुपये है।`;
  }

  let speech = `आपने ${item.name} पर क्लिक किया है। ${priceSentence}`;

  if (item.topping && item.weight) {
    speech += ` इसमें topping ${item.topping} का होता है और इसका वज़न करीब ${weightNumber(item.weight)} ग्राम होता है।`;
  } else if (item.topping) {
    speech += ` इसमें topping ${item.topping} का होता है।`;
  } else if (item.weight) {
    speech += ` इसका वज़न करीब ${weightNumber(item.weight)} ग्राम होता है।`;
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
      <ul className="mt-4 flex flex-wrap gap-2" aria-label={`Price options for ${labelId}`}>
        {tiers.map((t) => (
          <li
            key={t.qty}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-background px-3 py-1 text-sm"
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

function MenuGrid({ menu }: { menu: MenuItem[] }) {
  const { enabled, speakNow } = useVoice();

  return (
    <div className="mt-8 grid gap-6 md:grid-cols-2">
      {menu.map((item, index) => (
        <article
          key={item.name}
          className={[
            "rounded-3xl border border-border/80 bg-[#302844] p-6 shadow-soft md:p-8",
            enabled ? "cursor-pointer transition-transform hover:scale-[1.02] hover:border-accent/60 active:scale-[0.98]" : "",
          ].join(" ")}
          aria-labelledby={`menu-item-${index}-name`}
          role={enabled ? "button" : undefined}
          tabIndex={enabled ? 0 : undefined}
          aria-label={enabled ? `Tap to hear about ${item.name}` : undefined}
          onClick={enabled ? () => speakNow(buildItemSpeech(item)) : undefined}
          onKeyDown={
            enabled
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    speakNow(buildItemSpeech(item));
                  }
                }
              : undefined
          }
        >
          <h3 id={`menu-item-${index}-name`} className="font-serif text-2xl text-foreground">
            {item.name}
          </h3>
          <PriceDisplay price={item.price} labelId={item.name} />
          <p className="mt-3 text-muted-foreground">{item.description}</p>

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
        </article>
      ))}
    </div>
  );
}

export function ProductDetail({
  title,
  image,
  alt,
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
      {/* Product Hero Banner */}
      <section className="border-b border-border/40 bg-[#302844] py-16 md:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 md:grid-cols-2">
          <div className="overflow-hidden rounded-3xl border border-border/60 shadow-elegant">
            <img src={image} alt={alt} width={1024} height={1024} className="h-full w-full object-cover" />
          </div>
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.4em] text-accent">{subtitle}</p>
            <h1 className="font-serif text-5xl text-foreground md:text-6xl">{title}</h1>
            <p className="mt-6 text-lg text-muted-foreground">{description}</p>
          </div>
        </div>
      </section>

      {items && items.length > 0 && (
        <section className="bg-[#282345] py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="font-serif text-3xl text-foreground">House favourites</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {items.map((it) => (
                <div key={it.name} className="rounded-3xl border border-border/80 bg-[#302844] p-8 shadow-soft">
                  <h3 className="font-serif text-2xl text-foreground">{it.name}</h3>
                  <p className="mt-3 text-muted-foreground">{it.description}</p>
                  <p className="mt-4 text-xs uppercase tracking-[0.3em] text-accent">{it.serves}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {menu && menu.length > 0 && (
        <section className="bg-[#282345] py-20" aria-labelledby="menu-heading">
          <div className="mx-auto max-w-6xl px-6">
            <h2 id="menu-heading" className="font-serif text-3xl text-foreground">
              Menu
            </h2>
            <p className="mt-3 text-muted-foreground">
              Prices are in Indian Rupees. All items are handcrafted and may vary slightly in weight.
            </p>

            <MenuGrid menu={menu} />

            {menuDefaults && (
              <div className="mt-8 grid gap-3 rounded-2xl border border-border/80 bg-[#302844] p-5 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
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
              <div className="mt-8 rounded-2xl border border-border/80 bg-[#302844] p-6 text-sm text-muted-foreground">
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

      {/* How to Enjoy Section */}
      <section className="border-t border-border/40 bg-[#302844] py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-accent">How to enjoy</p>
          <p className="mt-4 text-lg text-foreground">{care}</p>
          <div className="mt-6">
            <Link
              to="/care"
              className="inline-flex items-center text-sm font-medium text-accent hover:underline"
            >
              Full care guide →
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}
