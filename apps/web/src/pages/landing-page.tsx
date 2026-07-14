import { Link } from "react-router-dom"
import {
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  Code2,
  Database,
  FolderKanban,
  GitBranch,
  LockKeyhole,
  Network,
  NotebookPen,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"

const capabilities: Array<{ icon: LucideIcon; label: string; detail: string }> = [
  { icon: NotebookPen, label: "Capture", detail: "Solutions, notes, and decisions" },
  { icon: Network, label: "Connect", detail: "Relationships across every project" },
  { icon: RotateCcw, label: "Recall", detail: "Confidence-aware review queues" },
  { icon: GitBranch, label: "Deliver", detail: "Work and learning in one loop" },
]

const workflow = [
  { number: "01", title: "Capture", text: "Save a solution, concept, task, or TIL without deciding which silo it belongs in." },
  { number: "02", title: "Connect", text: "Link related work manually or review safe suggestions from the agent layer." },
  { number: "03", title: "Recall", text: "Bring fading knowledge back at the right moment and explain it in your own words." },
  { number: "04", title: "Ship", text: "Tie project delivery and GitHub activity back to the lessons that made it possible." },
]

const features: Array<{ icon: LucideIcon; title: string; text: string; tag: string }> = [
  { icon: Code2, title: "DSA tracking", text: "Keep solutions, patterns, revisit history, and confidence together.", tag: "Practice" },
  { icon: FolderKanban, title: "Project delivery", text: "Plan milestones and tasks while capturing the learning behind completed work.", tag: "Build" },
  { icon: Search, title: "Graph search", text: "Find related knowledge through structure, tags, embeddings, and confirmed links.", tag: "Discover" },
  { icon: Bot, title: "Grounded assistant", text: "Ask questions against your own graph and keep every answer tied to real context.", tag: "Reason" },
  { icon: GitBranch, title: "GitHub activity", text: "Turn real shipping signals into reviewable TIL drafts and project evidence.", tag: "Integrate" },
  { icon: RotateCcw, title: "Spaced recall", text: "Let confidence decay surface what needs another pass before it disappears.", tag: "Remember" },
]

function GraphPreview() {
  return (
    <div className="landing-float relative mx-auto w-full max-w-[620px]" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-blue-500/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900/95 shadow-2xl shadow-black/50">
        <div className="flex h-11 items-center gap-2 border-b border-zinc-800 px-4">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-blue-400/70" />
          <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Workspace / Knowledge graph</span>
        </div>
        <div className="grid min-h-[390px] grid-cols-[72px_1fr] sm:grid-cols-[150px_1fr]">
          <div className="border-r border-zinc-800 bg-zinc-950/80 p-3">
            <div className="mb-7 flex items-center gap-2 text-zinc-200"><Brain className="h-4 w-4 text-blue-300" /><span className="hidden text-xs sm:block">Dev KG</span></div>
            {["Today", "Projects", "Graph", "Recall"].map((item, index) => (
              <div key={item} className={`mb-2 flex items-center gap-2 rounded-md px-2 py-2 text-[10px] ${index === 2 ? "bg-blue-500/10 text-blue-200" : "text-zinc-600"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${index === 2 ? "bg-blue-300" : "bg-zinc-700"}`} />
                <span className="hidden sm:block">{item}</span>
              </div>
            ))}
          </div>
          <div className="relative overflow-hidden p-4 sm:p-6">
            <div className="flex items-start justify-between">
              <div><p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Connected knowledge</p><p className="mt-1 text-sm text-zinc-100">Architecture patterns</p></div>
              <span className="rounded-full border border-emerald-400/20 px-2 py-1 font-mono text-[8px] text-emerald-300">6 links</span>
            </div>
            <svg className="absolute inset-x-5 top-20 h-64 w-[calc(100%-2.5rem)]" viewBox="0 0 380 240">
              <g stroke="#3f3f46" strokeWidth="1">
                <line x1="190" y1="105" x2="64" y2="42" /><line x1="190" y1="105" x2="322" y2="52" />
                <line x1="190" y1="105" x2="78" y2="191" /><line x1="190" y1="105" x2="304" y2="191" />
                <line x1="64" y1="42" x2="322" y2="52" strokeDasharray="4 5" />
              </g>
            </svg>
            <div className="absolute left-[47%] top-[43%] z-10 -translate-x-1/2 rounded-xl border border-blue-400/30 bg-blue-500/15 px-4 py-3 text-center shadow-lg shadow-blue-950/40">
              <Network className="mx-auto h-4 w-4 text-blue-200" /><p className="mt-1 text-[10px] text-blue-100">Event systems</p>
            </div>
            <div className="absolute left-[20%] top-[28%] z-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[9px] text-zinc-300">Queues</div>
            <div className="absolute right-[8%] top-[31%] z-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[9px] text-zinc-300">Webhooks</div>
            <div className="absolute bottom-[18%] left-[23%] z-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[9px] text-zinc-300">Retries</div>
            <div className="absolute bottom-[17%] right-[10%] z-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[9px] text-zinc-300">Idempotency</div>
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/90 px-3 py-2">
              <span className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Agent suggestions require review</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function LandingPage() {
  return (
    <main className="relative overflow-hidden bg-zinc-950 text-zinc-300">
      <div className="landing-grid pointer-events-none absolute inset-x-0 top-0 h-[900px] opacity-50" />
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8" aria-label="Primary navigation">
          <Link to="/" className="flex items-center gap-3 rounded-md text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <span className="rounded-lg border border-blue-400/20 bg-blue-500/10 p-2"><Brain className="h-4 w-4 text-blue-300" /></span>
            <span className="text-sm font-semibold">Personal Dev KG</span>
          </Link>
          <div className="hidden items-center gap-7 md:flex">
            <a href="#features" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">Features</a>
            <a href="#workflow" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">Workflow</a>
            <a href="#security" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">Security</a>
          </div>
          <Button asChild size="sm"><Link to="/login">Sign in <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-16 px-4 pb-20 pt-20 sm:px-6 md:pt-28 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:pb-28">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-blue-300">
            <Sparkles className="h-3.5 w-3.5" /> A connected workspace for developers
          </div>
          <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-zinc-50 sm:text-6xl">
            Turn everything you build into knowledge you keep.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-zinc-400 sm:text-lg">
            Personal Dev KG connects code practice, project delivery, notes, recall, and grounded AI in one private graph—so every hard-won lesson compounds.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg"><Link to="/login">Open your workspace <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button asChild size="lg" variant="outline"><a href="#workflow">See how it works</a></Button>
          </div>
          <p className="mt-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-600">
            <LockKeyhole className="h-3.5 w-3.5 text-zinc-500" /> Private by design · Invite-only accounts
          </p>
        </div>
        <GraphPreview />
      </section>

      <section className="relative border-y border-zinc-800/80 bg-zinc-900/30">
        <div className="mx-auto grid max-w-7xl divide-y divide-zinc-800 px-4 sm:grid-cols-2 sm:divide-x sm:divide-y-0 sm:px-6 lg:grid-cols-4 lg:px-8">
          {capabilities.map(({ icon: Icon, label, detail }) => (
            <div key={label} className="flex gap-3 px-4 py-6 first:pl-0 sm:px-6 lg:py-8">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
              <div><p className="text-sm font-medium text-zinc-100">{label}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="workflow" className="relative scroll-mt-20 px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-300">A closed learning loop</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-zinc-50 sm:text-4xl">Do the work once. Keep the insight forever.</h2>
              <p className="mt-5 max-w-lg text-sm leading-7 text-zinc-400">
                The workspace follows the way development actually happens—from the first rough note to the lesson you can explain months later.
              </p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2">
              {workflow.map((step) => (
                <article key={step.number} className="group bg-zinc-950 p-6 transition-colors hover:bg-zinc-900/80 sm:p-8">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-blue-300">{step.number}</span>
                    <span className="h-px w-10 bg-zinc-800 transition-colors group-hover:bg-blue-400/50" />
                  </div>
                  <h3 className="mt-10 text-xl font-medium text-zinc-100">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-500">{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="relative scroll-mt-20 border-y border-zinc-800/80 bg-zinc-900/30 px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-300">One substrate, many lenses</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-zinc-50 sm:text-4xl">Everything a developer learns, in context.</h2>
            <p className="mt-5 text-sm leading-7 text-zinc-400">
              Your practice, projects, and notes stop competing for attention and start strengthening each other.
            </p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text, tag }) => (
              <article key={title} className="group rounded-2xl border border-zinc-800 bg-zinc-950 p-6 transition-all hover:-translate-y-1 hover:border-blue-400/30 hover:bg-zinc-900/60">
                <div className="flex items-start justify-between">
                  <span className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 transition-colors group-hover:border-blue-400/20 group-hover:bg-blue-500/10">
                    <Icon className="h-5 w-5 text-blue-300" />
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">{tag}</span>
                </div>
                <h3 className="mt-8 text-lg font-medium text-zinc-100">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-500">{text}</p>
              </article>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
            <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
              <div className="flex flex-col justify-center border-b border-zinc-800 p-7 sm:p-10 lg:border-b-0 lg:border-r">
                <div className="w-fit rounded-xl border border-blue-400/20 bg-blue-500/10 p-3"><Database className="h-5 w-5 text-blue-300" /></div>
                <h3 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-50">One stable knowledge substrate</h3>
                <p className="mt-4 text-sm leading-7 text-zinc-400">Projects, tasks, concepts, solutions, and TILs share a common graph. Different views, no fragmented source of truth.</p>
              </div>
              <div className="landing-grid relative min-h-[320px] p-6 sm:p-10">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["project", "Knowledge platform", "3 milestones"],
                    ["task", "Model graph search", "in progress"],
                    ["concept", "Vector retrieval", "0.84 confidence"],
                    ["til", "Reranking tradeoffs", "captured today"],
                  ].map(([type, title, meta], index) => (
                    <div key={title} className={`rounded-xl border p-4 ${index === 1 ? "border-blue-400/30 bg-blue-500/10" : "border-zinc-800 bg-zinc-900/90"}`}>
                      <p className="font-mono text-[9px] uppercase tracking-wider text-blue-300">{type}</p>
                      <p className="mt-3 text-sm text-zinc-100">{title}</p>
                      <p className="mt-2 text-[11px] text-zinc-600">{meta}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-center gap-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                  <span className="h-px w-8 bg-zinc-800" /> Connected by hierarchy + graph links <span className="h-px w-8 bg-zinc-800" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="security" className="relative scroll-mt-20 px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-20">
          <div>
            <div className="w-fit rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3"><ShieldCheck className="h-5 w-5 text-emerald-300" /></div>
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-emerald-300">Private by default</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-zinc-50 sm:text-4xl">Your graph stays yours.</h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-zinc-400">
              Access is invitation-only, workspace data is isolated by account, and secrets never need to live in the browser.
            </p>
            <div className="mt-8 space-y-4">
              {[
                "Seven-day HttpOnly sessions with short-lived API tokens",
                "Per-user encrypted provider and integration credentials",
                "Agent output remains a suggestion until you confirm it",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm leading-6 text-zinc-300">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" /> {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">Deep connection agent</p>
                  <h3 className="mt-2 text-base font-medium text-zinc-100">Suggested relationship</h3>
                </div>
                <span className="rounded-full border border-amber-400/20 bg-amber-400/5 px-3 py-1 font-mono text-[9px] uppercase tracking-wider text-amber-300">Needs review</span>
              </div>
              <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"><p className="font-mono text-[9px] text-blue-300">CONCEPT</p><p className="mt-2 text-xs text-zinc-200">Linked lists</p></div>
                <Network className="h-4 w-4 text-zinc-600" />
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"><p className="font-mono text-[9px] text-blue-300">TIL</p><p className="mt-2 text-xs text-zinc-200">Git history</p></div>
              </div>
              <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Why they connect</p>
                <p className="mt-2 text-xs leading-5 text-zinc-400">Both model a sequence of nodes where each state keeps a reference to earlier context.</p>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <span className="rounded-md border border-zinc-800 px-3 py-2 text-[10px] text-zinc-500">Reject</span>
                <span className="rounded-md bg-blue-500 px-3 py-2 text-[10px] font-medium text-white">Review and confirm</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-24 sm:px-6 lg:px-8 lg:pb-32">
        <div className="landing-grid relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-blue-400/20 bg-blue-500/[0.07] px-6 py-16 text-center sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/15 blur-[100px]" />
          <div className="relative">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-300">Your workspace is waiting</p>
            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.035em] text-zinc-50 sm:text-4xl">Build a second brain that understands the first.</h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-zinc-400">Sign in to continue capturing, connecting, and recalling the work that matters.</p>
            <Button asChild size="lg" className="mt-8"><Link to="/login">Sign in to your workspace <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-800/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 text-sm text-zinc-300"><Brain className="h-4 w-4 text-blue-300" /> Personal Dev KG</div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Capture · Connect · Recall · Ship</p>
          <Link to="/login" className="text-sm text-zinc-500 transition-colors hover:text-zinc-100">Sign in</Link>
        </div>
      </footer>
    </main>
  )
}
