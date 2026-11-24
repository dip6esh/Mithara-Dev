import { useEffect, useState } from "react";

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Time-of-day greeting based on the viewer's own clock.
 * The server (Cloudflare Worker) runs in UTC, so computing this during SSR gives the wrong
 * greeting. We render a neutral "Welcome" first, then set the real one after mount and
 * refresh it every minute so it stays right if the tab is left open.
 */
export function useGreeting(): string {
  const [greeting, setGreeting] = useState("Welcome");
  useEffect(() => {
    const update = () => setGreeting(greetingFor(new Date()));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);
  return greeting;
}
