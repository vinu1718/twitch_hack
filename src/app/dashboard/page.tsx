import { readAuth } from "@/lib/twitch/auth";
import { getSummary } from "@/lib/memory";
import { getLore } from "@/lib/lore";
import { DashboardLive } from "./dashboard-live";
import "./dashboard.css";
export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  const auth = await readAuth();
  const summary = await getSummary();
  const lore = await getLore();
  return (
    <>
      <a className="skip-link" href="#dashboard-main">
        Skip to controls
      </a>
      <DashboardLive
        login={auth?.login}
        initialSummary={summary}
        initialLore={lore}
      />
    </>
  );
}
