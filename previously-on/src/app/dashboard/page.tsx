export default function DashboardPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="max-w-xl space-y-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-violet-300">
          Previously On
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Streamer dashboard</h1>
        <p className="text-slate-300">
          Twitch login, microphone controls, live summary, raid briefing, and
          test controls will appear here.
        </p>
      </div>
    </main>
  );
}
