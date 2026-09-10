import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { VoiceHostProvider } from "../voice/VoiceHostProvider";
import { VoiceWelcomeOverlay } from "../voice/VoiceWelcomeOverlay";
import { VoiceStatusBar } from "../voice/VoiceStatusBar";
import { EdgeTapZones } from "../voice/EdgeTapZones";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-7xl text-foreground">404</h1>
        <h2 className="mt-4 font-serif text-2xl text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-gold px-6 py-3 text-sm font-medium text-gold-foreground shadow-soft transition-transform hover:scale-105"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mithara — Premium Voice-Enabled Dessert House" },
      {
        name: "description",
        content:
          "Mithara crafts premium kunafa and baklava. A voice-enabled website designed for everyone, including blind and low-vision visitors.",
      },
      { name: "author", content: "Mithara" },
      { property: "og:title", content: "Mithara — Premium Voice-Enabled Dessert House" },
      {
        property: "og:description",
        content:
          "Heirloom kunafa and baklava — hand crafted in small batches. Voice enabled, accessible to all.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Mithara — Premium Voice-Enabled Dessert House" },
      { name: "description", content: "Mithara's Voice Delight is a website for a premium dessert brand, offering an accessible online presence." },
      { property: "og:description", content: "Mithara's Voice Delight is a website for a premium dessert brand, offering an accessible online presence." },
      { name: "twitter:description", content: "Mithara's Voice Delight is a website for a premium dessert brand, offering an accessible online presence." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/21bc2fb2-128c-4ac2-98af-2d94ae21443c/id-preview-7d51495d--6d07827d-a825-46e5-9852-33bd80f4086e.lovable.app-1777565070887.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/21bc2fb2-128c-4ac2-98af-2d94ae21443c/id-preview-7d51495d--6d07827d-a825-46e5-9852-33bd80f4086e.lovable.app-1777565070887.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <VoiceHostProvider>
      <VoiceWelcomeOverlay />
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main id="main" className="flex-1">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
      <VoiceStatusBar />
      <EdgeTapZones />
    </VoiceHostProvider>
  );
}
