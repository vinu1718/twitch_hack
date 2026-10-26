import { readAuth } from "@/lib/twitch/auth";
import { getSummary } from "@/lib/memory";
import { DashboardLive } from "./dashboard-live";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const auth = await readAuth();
  const summary = await getSummary();
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-violet-300">
          Previously On
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Streamer dashboard</h1>
        {auth ? (
          <p className="text-slate-300">Connected to Twitch as {auth.login}.</p>
        ) : (
          <a
            href="/api/auth/login"
            className="inline-block rounded-lg bg-violet-400 px-5 py-3 font-semibold text-slate-950"
          >
            Connect Twitch
          </a>
        )}
        </header>
        {auth && <DashboardLive initialSummary={summary} />}
      </div>
    </main>
  );
}
