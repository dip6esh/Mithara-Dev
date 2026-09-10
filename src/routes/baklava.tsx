import { createFileRoute } from "@tanstack/react-router";
import baklavaImg from "../assets/baklava.jpg";
import { ProductDetail } from "../components/ProductDetail";
import type { MenuItem } from "../components/ProductDetail";

export const Route = createFileRoute("/baklava")({
  head: () => ({
    meta: [
      { title: "Baklava — Forty Layers, Honey-Soaked | Mithara" },
      {
        name: "description",
        content:
          "Mithara's baklava: forty paper-thin layers of phyllo, brushed with butter and bathed in honey, crowned with pistachios or walnuts.",
      },
      { property: "og:title", content: "Baklava | Mithara" },
      { property: "og:description", content: "Forty layers. Honey syrup. Bronte pistachios." },
    ],
  }),
  component: BaklavaPage,
});

const MENU_DEFAULTS = {
  dietary: ["Vegetarian", "Eggless"],
  temperature: "Room temperature or Hot",
  shelfLife: "30 days",
  storage: "Store in an airtight container at room temperature or refrigerate to maintain freshness.",
};

const MENU: MenuItem[] = [
  {
    name: "Pistachio Square Baklava",
    description:
      "Indulge in the crunch and richness of our Pistachio Square Baklava, featuring layers of flaky phyllo dough, nutty pistachios, and a hint of sweetness.",
    ingredients: ["Flour", "Water", "Oil", "Pistachios", "Sugar", "Lemon", "Saffron"],
    allergens: ["Gluten", "Tree Nuts (Pistachios)", "Spices"],
    price: "6pc/9pc/12pc/18pc - ₹700/₹975/₹1225/₹1800",
  },
  {
    name: "Flower Baklava",
    description:
      "Experience the majestic layers of our Pyramid Baklava, featuring crispy phyllo dough, rich nuts, and a touch of sweetness, all stacked into a stunning pyramid shape.",
    ingredients: ["Flour", "Water", "Oil", "Walnuts/Pistachios", "Sugar", "Lemon", "Saffron"],
    allergens: ["Gluten", "Tree Nuts (Walnuts or Pistachios)", "Spices"],
    price: "6pc/9pc/12pc/18pc - ₹800/₹1100/₹1400/₹2050",
  },
  {
    name: "Almond Finger Rolls",
    description:
      "Indulge in the crispy, nutty goodness of our Baklava Roll, featuring layers of flaky phyllo dough wrapped around a rich mixture of almonds and sweet syrup.",
    ingredients: ["Flour", "Water", "Oil", "Almonds", "Sugar", "Lemon", "Saffron"],
    allergens: ["Gluten", "Tree Nuts (Almonds)", "Spices"],
    price: "6pc/9pc/12pc/18pc - ₹400/₹525/₹625/₹875",
  },
  {
    name: "Tart Baklava",
    description:
      "Indulge in the perfect harmony of crunch and sweetness with our signature Tart Baklava, featuring layers of flaky phyllo dough, and a rich nutty filling.",
    ingredients: ["Flour", "Water", "Oil", "Almonds", "Pistachios", "Walnuts", "Sugar", "Lemon", "Saffron"],
    allergens: ["Gluten", "Tree Nuts (Almonds, pistachio & walnut)", "Spices"],
    price: "6pc/9pc/12pc/18pc - ₹825/₹1175/₹1500/₹2175",
  },
  {
    name: "Nutella Nest Baklava",
    description:
      "For chocolate lovers, a rich Nutella filling topped on crispy shredded phyllo dough.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Sugar",
      "Palm Oil",
      "Hazelnuts",
      "Cocoa",
      "Skimmed Milk Powder",
      "Soy Lecithin",
      "Lemon",
      "Saffron",
    ],
    allergens: ["Gluten", "Tree Nuts (hazelnuts)", "Soy", "Spices"],
    price: "6pc/9pc/12pc/18pc - ₹575/₹800/₹1000/₹1425",
  },
  {
    name: "Rose Baklava",
    description:
      "For cookie butter lovers, a rich Biscoff filling topped on crispy shredded phyllo dough.",
    ingredients: ["Flour", "Water", "Salt", "Sugar", "Palm Oil", "Cookies", "Cocoa", "Lemon", "Saffron"],
    allergens: ["Gluten", "Soy (may contain soy)", "Spices"],
    price: "6pc/9pc/12pc/18pc - ₹575/₹800/₹1000/₹1425",
  },
  {
    name: "Assorted 6 pc.",
    description: "A curated assortment of signature baklava pieces, perfect for gifting or sampling.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Oil",
      "Pistachios",
      "Sugar",
      "Palm Oil",
      "Hazelnuts",
      "Cocoa",
      "Skimmed Milk Powder",
      "Soy Lecithin",
      "Lemon",
      "Saffron",
    ],
    allergens: ["Gluten", "Tree Nuts (pistachios, hazelnuts)", "Spices", "Soy"],
    price: "₹ 750/-",
  },
  {
    name: "Assorted 9 pc.",
    description: "A generous box of mixed baklava, blending classic and contemporary flavours.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Oil",
      "Sugar",
      "Palm Oil",
      "Hazelnuts",
      "Pistachios",
      "Almonds",
      "Walnuts",
      "Cocoa",
      "Skimmed Milk Powder",
      "Soy Lecithin",
      "Lemon",
      "Saffron",
    ],
    allergens: ["Gluten", "Tree Nuts (pistachios, hazelnuts, almonds and walnuts)", "Spices", "Soy"],
    price: "₹1000/-",
  },
  {
    name: "Assorted 12 pc.",
    description: "Our largest curated box, ideal for celebrations and sharing.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Oil",
      "Sugar",
      "Palm Oil",
      "Hazelnuts",
      "Pistachios",
      "Almonds",
      "Walnuts",
      "Cocoa",
      "Skimmed Milk Powder",
      "Soy Lecithin",
      "Lemon",
      "Saffron",
    ],
    allergens: ["Gluten", "Tree Nuts (pistachios, hazelnuts, almonds and walnuts)", "Spices", "Soy"],
    price: "₹1100/-",
  },
  {
    name: "Assorted 18 pc.",
    description: "A celebration-sized assortment with the full range of Mithara baklava.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Oil",
      "Sugar",
      "Palm Oil",
      "Hazelnuts",
      "Pistachios",
      "Almonds",
      "Walnuts",
      "Cocoa",
      "Skimmed Milk Powder",
      "Soy Lecithin",
      "Cookies",
      "Lemon",
      "Saffron",
    ],
    allergens: ["Gluten", "Tree Nuts (pistachios, hazelnuts, almonds and walnuts)", "Spices", "Soy"],
    price: "₹1625/-",
  },
];

function BaklavaPage() {
  return (
    <ProductDetail
      title="Baklava"
      image={baklavaImg}
      alt="A stacked piece of Mithara baklava, glistening with honey and topped with chopped pistachios and walnuts, on a decorative gold-rimmed plate."
      subtitle="Layered. Honeyed. Patient."
      description="Our baklava is a study in patience. Forty paper-thin layers of phyllo, brushed with clarified butter, baked to a deep amber, then bathed in honey syrup the moment it leaves the oven."
      care="Keep at room temperature in a sealed tin lined with parchment for up to 2 weeks. Do not refrigerate. Freeze up to 2 months."
      menu={MENU}
      menuDefaults={MENU_DEFAULTS}
      menuNotes={[
        "All Baklava variations contain sugar syrup and saffron strains.",
        "Customers with specific dietary restrictions or allergies should inform the chef or the outlet manager. While we take great care, our kitchen handles nuts, dairy, and gluten.",
        "Cross-contamination with other ingredients is possible.",
        "All sweets are handcrafted in small batches with seasonal ingredients. Natural variation in color or texture may occur.",
        "Our offerings are made with ritual care, honoring traditions of taste, touch, and time.",
      ]}
    />
  );
}
