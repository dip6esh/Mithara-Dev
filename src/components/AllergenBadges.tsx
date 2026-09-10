import React, { useState } from "react";
import dairyIcon from "../assets/allergens/dairy.png";
import glutenIcon from "../assets/allergens/gluten.png";
import nutsIcon from "../assets/allergens/nuts.png";
import spicesIcon from "../assets/allergens/spices.png";
import soyIcon from "../assets/allergens/soy.png";

export interface AllergenMeta {
  raw: string;
  category: string;
  detail: string;
  icon: string;
  displayName: string;
}

export function parseAllergen(allergen: string): AllergenMeta {
  const trimmed = allergen.trim();
  const match = trimmed.match(/^([^(]+)(?:\((.+)\))?$/);
  const categoryRaw = match ? match[1].trim() : trimmed;
  const detailRaw = match && match[2] ? match[2].trim() : "";

  const lower = trimmed.toLowerCase();

  let icon = spicesIcon;
  let category = categoryRaw;
  let detail = detailRaw;

  if (
    lower.includes("dairy") ||
    lower.includes("milk") ||
    lower.includes("cheese") ||
    lower.includes("cream") ||
    lower.includes("butter") ||
    lower.includes("lactose")
  ) {
    icon = dairyIcon;
    category = "Dairy";
    if (!detail) detail = "Milk, cream, cheese";
  } else if (
    lower.includes("gluten") ||
    lower.includes("wheat") ||
    lower.includes("flour")
  ) {
    icon = glutenIcon;
    category = "Gluten";
    if (!detail) detail = "Wheat flour pastry";
  } else if (
    lower.includes("nut") ||
    lower.includes("pistachio") ||
    lower.includes("hazelnut") ||
    lower.includes("almond") ||
    lower.includes("walnut") ||
    lower.includes("peanut")
  ) {
    icon = nutsIcon;
    category = lower.includes("peanut") ? "Peanuts" : "Tree Nuts";
    if (!detail) {
      if (lower.includes("pistachio")) detail = "Pistachio";
      else if (lower.includes("hazelnut")) detail = "Hazelnuts";
      else if (lower.includes("peanut")) detail = "Peanuts";
      else detail = "Tree nuts";
    }
  } else if (
    lower.includes("spice") ||
    lower.includes("vanilla") ||
    lower.includes("saffron") ||
    lower.includes("cardamom")
  ) {
    icon = spicesIcon;
    category = "Spices";
    if (!detail) detail = "Aromatic spices";
  } else if (lower.includes("soy")) {
    icon = soyIcon;
    category = "Soy";
    if (!detail) detail = "Soy lecithin";
  }

  const displayName = detail ? `${category} (${detail})` : category;

  return {
    raw: trimmed,
    category,
    detail,
    icon,
    displayName,
  };
}

export function AllergenBadges({ allergens }: { allergens: string[] }) {
  // Only one allergen detail open at a time (accordion behaviour)
  const [openRaw, setOpenRaw] = useState<string | null>(null);

  const parsedList = allergens.map(parseAllergen);

  const toggle = (raw: string) => {
    setOpenRaw((prev) => (prev === raw ? null : raw));
  };

  return (
    <div className="mt-2">
      <dt className="font-medium text-foreground flex items-center gap-1.5">
        <span>Allergens</span>
        <span className="text-[11px] font-normal text-muted-foreground/75 italic">
          (click icon to reveal)
        </span>
      </dt>

      <dd className="mt-2 flex flex-wrap items-center gap-2">
        {parsedList.map((info) => {
          const isOpen = openRaw === info.raw;
          return (
            <button
              key={info.raw}
              type="button"
              onClick={() => toggle(info.raw)}
              aria-expanded={isOpen}
              aria-label={`${info.category}. Click to ${isOpen ? "hide" : "reveal"} details`}
              title={
                isOpen
                  ? `${info.displayName}. Click to collapse.`
                  : `${info.category}. Click icon to reveal details.`
              }
              className={`group relative inline-flex h-9 items-center rounded-full border transition-all duration-300 ease-out shadow-xs cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isOpen
                  ? "max-w-[400px] border-accent bg-accent/15 text-foreground ring-1 ring-accent/40 shadow-soft pl-0.5 pr-3"
                  : "w-9 max-w-9 justify-center border-border/80 bg-background/90 hover:border-accent/60 hover:bg-accent/10 text-muted-foreground hover:text-foreground hover:scale-105 p-0"
              }`}
            >
              {/* Allergen Icon */}
              <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                <img
                  src={info.icon}
                  alt={`${info.category} icon`}
                  className="h-full w-full rounded-full object-contain transition-transform duration-300 group-hover:scale-105"
                  width={32}
                  height={32}
                  loading="lazy"
                />
              </span>

              {/* Smooth sliding open allergen detail */}
              <span
                className={`inline-flex items-center overflow-hidden transition-all duration-300 ease-out ${
                  isOpen
                    ? "max-w-[320px] opacity-100 pl-1.5"
                    : "max-w-0 opacity-0 pl-0 pointer-events-none"
                }`}
              >
                <span className="text-xs font-medium text-foreground whitespace-nowrap">
                  <span className="font-semibold text-accent">{info.category}</span>
                  {info.detail && (
                    <span className="text-muted-foreground font-normal"> ({info.detail})</span>
                  )}
                </span>
                <span
                  className="ml-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[9px] font-bold text-foreground/70 hover:bg-foreground/20 hover:text-foreground transition-colors"
                  aria-hidden="true"
                >
                  ✕
                </span>
              </span>
            </button>
          );
        })}
      </dd>
    </div>
  );
}
