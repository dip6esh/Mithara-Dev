/**
 * Per-page narration scripts the voice guide reads.
 * Home is a brief welcome that teaches the tap navigation;
 * other pages announce position so blind visitors
 * always know where they are in the six-page ring.
 */

export const WELCOME_INTRO = [
  "Welcome to मिठारा.",
  "A premium dessert house. Dessert by Desert People. Made for the sweet moments.",
  "You're on the home page — page 1 of 5.",
  "To move between pages, tap the right edge of the screen for the next page, or the left edge to go back. On a keyboard, press Alt and the left or right arrow key.",
  "Press M at any time to mute the voice guide.",
].join(" ");

/** The top-level pages, in order, used by the edge-tap ring. */
export const MAIN_ROUTES = ["/", "/kunafa", "/baklava", "/care", "/about"] as const;
export type MainRoute = (typeof MAIN_ROUTES)[number];

export const PAGE_NARRATION: Record<string, string> = {
  "/": WELCOME_INTRO,
  "/kunafa":
    "कुनाफ़ा page. Page 2 of 5. Golden, warm and irresistible. Twelve handcrafted varieties, from Cream and Cream Cheese to Biscoff, Nutella, Rabdi, and more.",
  "/baklava":
    "बक्लावा page. Page 3 of 5. Layer upon layer of indulgence. Ten handcrafted varieties, from Pistachio Square and Flower to Nutella Nest and Rose. Assorted boxes start at 750 rupees.",
  "/care": "Care and Enjoyment guide. Page 4 of 5.",
  "/about": "About मिठारा. Page 5 of 5.",
};
