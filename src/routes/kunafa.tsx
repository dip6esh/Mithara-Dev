import { createFileRoute } from "@tanstack/react-router";
import kunafaImg from "../assets/hero/Kunafa_hero_1.jpg";
import creamKunafaImg from "../assets/kunafa/cream-kunafa.jpg";
import creamCheeseKunafaImg from "../assets/kunafa/cream-cheese-kunafa.jpg";
import biscoffKunafaImg from "../assets/kunafa/biscoff-kunafa.jpg";
import nutellaKunafaImg from "../assets/kunafa/nutella-kunafa.jpg";
import oreoKunafaImg from "../assets/kunafa/oreo-kunafa.jpg";
import kitkatKunafaImg from "../assets/kunafa/kitkat-kunafa.jpg";
import ferreroRocherKunafaImg from "../assets/kunafa/ferrero-rocher-kunafa.jpg";
import snickersKunafaImg from "../assets/kunafa/snickers-kunafa.jpg";
import bountyKunafaImg from "../assets/kunafa/bounty-kunafa.jpg";
import butterscotchKunafaImg from "../assets/kunafa/butterscotch-kunafa.jpg";
import caramelKunafaImg from "../assets/kunafa/caramel-kunafa.jpg";
import rabdiKunafaImg from "../assets/kunafa/rabdi-kunafa.jpg";
import { ProductDetail } from "../components/ProductDetail";
import type { MenuItem } from "../components/ProductDetail";

export const Route = createFileRoute("/kunafa")({
  head: () => ({
    meta: [
      { title: "Kunafa — Golden, Crisp, Warm | Mithara" },
      {
        name: "description",
        content:
          "Mithara's signature kunafa: shredded kataifi pastry with a warm cheese or cream center, finished with rose syrup and pistachios.",
      },
      { property: "og:title", content: "Kunafa | Mithara" },
      {
        property: "og:description",
        content: "Hand-pulled kataifi, melted center, rose syrup, pistachios.",
      },
    ],
  }),
  component: KunafaPage,
});

const MENU_DEFAULTS = {
  dietary: ["Vegetarian", "Eggless"],
  temperature: "Warm",
  shelfLife: "12 hours",
  storage: "Store in an airtight container at room temperature or in the refrigerator.",
};

const MENU: MenuItem[] = [
  {
    name: "Cream Kunafa",
    image: creamKunafaImg,
    imageAlt:
      "A round golden kataifi Cream Kunafa on a speckled ceramic plate, topped with pistachio powder.",
    description:
      "A traditional Middle Eastern dessert with a creamy cheese filling, wrapped in crispy phyllo dough.",
    ingredients: ["Flour", "Salt", "Milk", "Cream", "Cultures", "Sugar", "Lemon", "Saffron"],
    allergens: ["Dairy (milk, cream, cheese)", "Gluten", "Spices", "Tree Nuts (Pistachio)"],
    topping: "Pistachio powder",
    weight: "165 grams - 175 grams Approx",
    price: "₹ 400/-",
  },
  {
    name: "Cream Cheese Kunafa",
    image: creamCheeseKunafaImg,
    imageAlt:
      "Golden Cream Cheese Kunafa being lifted with a spatula revealing a long cheese pull, topped with crushed pistachios.",
    description:
      "A traditional Middle Eastern dessert with a creamy cheese filling, wrapped in crispy phyllo dough.",
    ingredients: [
      "Flour",
      "Salt",
      "Milk",
      "Cream",
      "Cultures",
      "Mozzarella",
      "Sugar",
      "Lemon",
      "Saffron",
    ],
    allergens: ["Dairy (milk, cream, cheese)", "Gluten", "Spices", "Tree Nuts (Pistachio)"],
    topping: "Pistachio powder",
    weight: "165 grams - 185 grams Approx",
    price: "₹ 450/-",
  },
  {
    name: "Biscoff Kunafa",
    image: biscoffKunafaImg,
    imageAlt:
      "Round Biscoff Kunafa topped with smooth caramel Biscoff spread and a whole Biscoff biscuit on a ceramic plate.",
    description:
      "A twist on the classic, with Biscoff spread and crushed cookies adding a delightful crunch.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Sugar",
      "Palm Oil",
      "Vegetable Oil",
      "Wheat Flour",
      "Cocoa",
      "Soy Lecithin",
      "Milk",
      "Cream",
      "Cultures",
      "Lemon",
      "Saffron",
    ],
    allergens: ["Dairy (milk, cream, cheese)", "Gluten", "Soy", "Spices"],
    topping: "Biscoff Spread & Biscoff biscuit dust",
    weight: "165 grams - 175 grams Approx",
    price: "₹ 425/-",
  },
  {
    name: "Nutella Kunafa",
    image: nutellaKunafaImg,
    imageAlt:
      "Golden kataifi Nutella Kunafa with a grid of Nutella chocolate drizzle on top, served on a speckled ceramic plate.",
    description: "For chocolate lovers, a rich Nutella filling wrapped in crispy phyllo dough.",
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
      "Milk",
      "Cream",
      "Cultures",
      "Lemon",
      "Saffron",
    ],
    allergens: ["Dairy (milk, cream, cheese)", "Gluten", "Tree Nuts (hazelnuts)", "Soy", "Spices"],
    topping: "Nutella Spread",
    weight: "165 grams - 195 grams Approx",
    price: "₹ 425/-",
  },
  {
    name: "Oreo Kunafa",
    image: oreoKunafaImg,
    imageAlt:
      "Round kataifi Oreo Kunafa blanketed in crushed Oreo powder with a whole Oreo biscuit centered on top.",
    description: "A cookies and cream delight, with crushed Oreos adding a playful touch.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Sugar",
      "Vegetable Oil",
      "Cocoa",
      "Milk",
      "Cream",
      "Cultures",
      "Lemon",
      "Saffron",
      "Stabilizers",
    ],
    allergens: ["Dairy (milk, cream, cheese)", "Gluten", "Spices"],
    topping: "Oreo Biscuit powder",
    weight: "175 grams - 200 grams Approx",
    price: "₹ 430/-",
  },
  {
    name: "KitKat Kunafa",
    image: kitkatKunafaImg,
    imageAlt:
      "Golden kataifi KitKat Kunafa topped with KitKat wafer bars arranged in a cross pattern with chocolate drizzle.",
    description: "A crunchy KitKat surprise, wrapped in crispy phyllo dough.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Sugar",
      "Wheat Flour",
      "Cocoa",
      "Milk",
      "Cream",
      "Skimmed Milk Powder",
      "Cultures",
      "Palm Oil",
      "Vegetable Oil",
      "Hazelnuts",
      "Soy Lecithin",
      "Lemon",
      "Saffron",
    ],
    allergens: ["Dairy (milk, cream, cheese)", "Gluten", "Soy", "Spices", "Tree Nuts (hazelnuts)"],
    topping: "Nutella spread & Kit Kat Waffle Pieces",
    weight: "175 grams - 200 grams Approx",
    price: "₹ 475/-",
  },
  {
    name: "Ferrero Rocher Kunafa",
    image: ferreroRocherKunafaImg,
    imageAlt:
      "Crispy kataifi Ferrero Rocher Kunafa topped with halved Ferrero Rocher chocolates and Nutella drizzle on a ceramic plate.",
    description: "A luxurious Ferrero Rocher filling wrapped in crispy phyllo dough.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Sugar",
      "Cocoa",
      "Milk",
      "Cream",
      "Skimmed Milk Powder",
      "Cultures",
      "Vegetable Oil",
      "Palm Oil",
      "Hazelnuts",
      "Soy Lecithin",
      "Lemon",
      "Saffron",
    ],
    allergens: ["Dairy (milk, cream, cheese)", "Gluten", "Tree Nuts (hazelnuts)", "Soy", "Spices"],
    topping: "Ferrero Rocher chocolate & Nutella spread",
    weight: "175 grams - 200 grams Approx",
    price: "₹ 495/-",
  },
  {
    name: "Snickers Kunafa",
    image: snickersKunafaImg,
    imageAlt:
      "Golden kataifi Snickers Kunafa topped with broken Snickers bar pieces and Nutella drizzle on a ceramic plate.",
    description: "A caramel, peanut, and chocolate surprise wrapped in crispy phyllo dough.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Sugar",
      "Milk",
      "Cream",
      "Skimmed Milk Powder",
      "Cultures",
      "Cocoa",
      "Peanuts",
      "Hazelnuts",
      "Palm Oil",
      "Vegetable Oil",
      "Soy Lecithin",
      "Corn Syrup",
      "Lemon",
      "Saffron",
    ],
    allergens: ["Dairy (milk, cream, cheese)", "Gluten", "Peanuts", "Spices"],
    topping: "Snickers Chocolate & Nutella spread",
    weight: "200 grams - 225 grams Approx",
    price: "₹ 475/-",
  },
  {
    name: "Bounty Kunafa",
    image: bountyKunafaImg,
    imageAlt:
      "Golden kataifi Bounty Kunafa topped with sliced coconut Bounty chocolate pieces and chocolate drizzle on a ceramic plate.",
    description:
      "A tropical coconut surprise wrapped in crispy phyllo dough, featuring Bounty chocolate.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Sugar",
      "Cocoa",
      "Milk",
      "Cream",
      "Skimmed Milk Powder",
      "Lactose",
      "Milk Fat",
      "Nonfat Milk Solids",
      "Cultures",
      "Vegetable Oil",
      "Palm Oil",
      "Hazelnuts",
      "Coconut",
      "Soy Lecithin",
      "Lemon",
      "Saffron",
    ],
    allergens: [
      "Dairy (milk, milk powder, lactose)",
      "Gluten",
      "Soy",
      "Spices",
      "Tree Nuts (hazelnuts)",
    ],
    topping: "Bounty Chocolate & Nutella Spread",
    weight: "175 grams - 200 grams Approx",
    price: "₹ 550/-",
  },
  {
    name: "Caramel Kunafa",
    image: caramelKunafaImg,
    imageAlt:
      "Plain round golden kataifi Caramel Kunafa on a speckled ceramic plate, no visible topping.",
    description: "A rich and creamy caramel filling wrapped in crispy phyllo dough.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Sugar",
      "Corn Syrup",
      "Milk",
      "Cream",
      "Skim Milk",
      "Butter",
      "Cocoa",
      "Palm Oil",
      "Soy Lecithin",
      "Cultures",
      "Lemon",
      "Saffron",
      "Artificial Flavor",
    ],
    allergens: ["Dairy (milk, cream, cheese, skim milk, butter)", "Gluten", "Soy", "Spices"],
    topping: "Caramel Syrup",
    weight: "175 grams - 200 grams Approx",
    price: "₹ 455/-",
  },
  {
    name: "Butterscotch Kunafa",
    image: butterscotchKunafaImg,
    imageAlt:
      "Round golden kataifi Butterscotch Kunafa topped with a cluster of caramel butterscotch chips on a ceramic plate.",
    description: "A sweet and creamy butterscotch filling wrapped in crispy phyllo dough.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Sugar",
      "Milk",
      "Cream",
      "Cultures",
      "Butter",
      "Citric Acid",
      "Preservatives",
      "Lemon",
      "Saffron",
    ],
    allergens: ["Dairy (milk, cream, cheese)", "Gluten", "Spices"],
    topping: "Butter Scotch Syrup",
    weight: "175 grams - 200 grams Approx",
    price: "₹ 455/-",
  },
  {
    name: "Rabdi Kunafa",
    image: rabdiKunafaImg,
    imageAlt:
      "Golden circular kataifi Rabdi Kunafa generously layered with thick creamy rabdi and studded with whole and crushed pistachios.",
    description:
      "A rich and creamy rabdi filling with a hint of pistachio, wrapped in crispy phyllo dough.",
    ingredients: [
      "Flour",
      "Water",
      "Salt",
      "Milk",
      "Condensed Milk",
      "Sugar",
      "Cream",
      "Cultures",
      "Pistachio",
      "Lemon",
      "Saffron",
    ],
    allergens: ["Dairy (milk, condensed milk)", "Gluten", "Spices", "Tree Nuts (Pistachio)"],
    topping: "Pistachio powder & Rabdi",
    weight: "200 grams - 250 grams Approx",
    price: "₹ 535/-",
  },
];

function KunafaPage() {
  return (
    <ProductDetail
      title="Kunafa"
      image={kunafaImg}
      focus="45% 50%"
      alt="A slice of Mithara kunafa being lifted from a speckled plate, with melted white cheese stretching out from golden crisp kataifi under crushed pistachios, beside brass lanterns and dates."
      subtitle="Golden. Crisp. Molten."
      description="Kunafa is our signature dessert. Threads of kataifi pastry, baked golden, hiding a warm center that pulls into long, glistening strands when you cut it."
      care="Best served warm. Heat 8–10 minutes at 150°C, or 30 seconds in the microwave. Refrigerate up to 3 days; freeze unbaked up to 1 month."
      menu={MENU}
      menuDefaults={MENU_DEFAULTS}
      menuNotes={[
        "All Kunafa variations contain sugar syrup and Kesar strains.",
        "Customers with specific dietary restrictions or allergies should inform the chef or the outlet manager. While we take great care, our kitchen handles nuts, dairy, and gluten.",
        "Cross-contamination with other ingredients is possible.",
        "All sweets are handcrafted in small batches with seasonal ingredients. Natural variation in color or texture may occur.",
        "Our offerings are made with ritual care, honoring traditions of taste, touch, and time.",
      ]}
    />
  );
}
