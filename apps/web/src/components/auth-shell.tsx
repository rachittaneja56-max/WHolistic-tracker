import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Brain, CheckCircle2, Network, ShieldCheck, Sparkles } from "lucide-react"

type AuthShellProps = {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}

const workspacePoints = [
  { icon: Network, text: "One graph for knowledge and active work" },
  { icon: Sparkles, text: "AI suggestions stay reviewable" },
  { icon: ShieldCheck, text: "Private, isolated workspaces" },
]

export function AuthShell({ eyebrow, title, description, children }: AuthShellProps) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-zinc-950 text-zinc-300">
      <div className="landing-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute left-[-12rem] top-[-12rem] h-[30rem] w-[30rem] rounded-full bg-blue-500/10 blur-[120px]" />
      <div className="relative mx-auto grid min-h-dvh max-w-[1440px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden border-r border-zinc-800/80 px-12 py-10 lg:flex lg:flex-col xl:px-20">
          <Link to="/" className="flex w-fit items-center gap-3 rounded-md text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <span className="rounded-lg border border-blue-400/20 bg-blue-500/10 p-2.5"><Brain className="h-5 w-5 text-blue-300" /></span>
            <span className="font-semibold">Personal Dev KG</span>
          </Link>

          <div className="my-auto max-w-xl py-16">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-blue-300">Your work, connected</p>
            <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.03em] text-zinc-50 xl:text-5xl">
              Sign back into the system that remembers how you build.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-zinc-400">
              Capture solutions, project decisions, and hard-won lessons in one private developer workspace.
            </p>

            <div className="mt-10 space-y-4">
              {workspacePoints.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm text-zinc-300">
                  <span className="rounded-md border border-zinc-800 bg-zinc-900 p-2"><Icon className="h-4 w-4 text-blue-300" /></span>
                  {text}
                </div>
              ))}
            </div>

            <div className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-2xl shadow-black/20">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Knowledge health</p>
                  <p className="mt-1 text-sm text-zinc-100">Today&apos;s connected workspace</p>
                </div>
                <span className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1 font-mono text-[10px] text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Private
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {["Capture", "Connect", "Recall"].map((label, index) => (
                  <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
                    <CheckCircle2 className={index === 2 ? "h-4 w-4 text-amber-300" : "h-4 w-4 text-blue-300"} />
                    <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">Invite-only access · Better Auth protected</p>
        </section>

        <section className="relative flex min-h-dvh items-center justify-center px-4 py-20 sm:px-8 lg:px-12">
          <Link to="/" className="absolute left-5 top-6 inline-flex items-center gap-2 rounded-md text-sm text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:left-auto lg:right-10">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
          <div className="w-full max-w-md">
            <div className="mb-7 flex items-center gap-3 lg:hidden">
              <span className="rounded-lg border border-blue-400/20 bg-blue-500/10 p-2.5"><Brain className="h-5 w-5 text-blue-300" /></span>
              <span className="font-semibold text-zinc-100">Personal Dev KG</span>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 shadow-2xl shadow-black/30 backdrop-blur">
              <div className="border-b border-zinc-800 px-6 py-6 sm:px-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-300">{eyebrow}</p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50">{title}</h1>
                <p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p>
              </div>
              <div className="px-6 py-6 sm:px-8 sm:py-7">{children}</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
