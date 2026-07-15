import { Link } from "react-router-dom"
import { ArrowRight, BookOpenCheck, Brain, Braces, Check, CheckCircle2, Code2, FileText, FolderKanban, Github, LockKeyhole, Network, RotateCcw, ShieldCheck, Sparkles } from "lucide-react"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"

const outcomes = [
  { icon: BookOpenCheck, title: "Learn consistently", text: "Turn subjects, assignments, practice, and deadlines into one clear next action." },
  { icon: FolderKanban, title: "Build projects", text: "Connect active work to the decisions, concepts, and lessons that made it possible." },
  { icon: RotateCcw, title: "Retain knowledge", text: "Review fading ideas from memory and confirm every durable confidence change." },
]

const trust = [
  { title: "Grounded context", text: "AI receives task-specific fields, not an unrestricted dump of your workspace." },
  { title: "Evidence attached", text: "Graph answers point to canonical source excerpts; unsupported citations are rejected." },
  { title: "Review before write", text: "Suggestions begin unselected. You inspect the exact changes before a separate apply step." },
  { title: "Injection containment", text: "Notes, code, imports, and web content are labelled as untrusted data, sanitized, and kept away from write authority." },
]

const faq = [
  ["Does AI write directly to my knowledge base?", "No. AI can prepare advice, grades, or proposed changes. Durable writes and learning-state changes require an explicit confirmation."],
  ["Can I use it beyond software development?", "Yes. The workspace supports broad subjects and projects; DSA and developer workflows are the strongest initial specialization."],
  ["How does LeetCode import work?", "A paired browser extension captures metadata and, when available, accepted status, code, and notes from your own LeetCode session. Each field reports its capture status."],
  ["Which AI provider is required?", "None is hard-wired. The server supports provider-neutral configuration, and core tracking remains available when AI is disabled."],
]

function ProductFlow() {
  return <div className="relative min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-panel">
    <div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-foreground">Personal Dev KG</span></div><span className="rounded-full bg-success/10 px-2 py-1 font-mono text-[10px] text-success">Review controlled</span></div>
    <div className="grid min-h-[410px] md:grid-cols-[170px_1fr]">
      <aside className="hidden border-r border-border bg-background p-3 md:block">{["Home", "Learn", "Projects", "Library", "AI Coach"].map((item, index) => <div key={item} className={`mb-1 rounded-lg px-3 py-2 text-xs ${index === 0 ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground"}`}>{item}</div>)}</aside>
      <div className="p-4 sm:p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Recommended next action</p>
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">Recall</span><span className="text-xs text-muted-foreground">8 minutes</span></div><p className="mt-3 font-semibold text-foreground">Explain why a sliding window stays linear</p><p className="mt-1 text-sm text-secondary">Due because confidence is fading after recent DSA practice.</p><button type="button" tabIndex={-1} className="mt-4 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">Start review</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border bg-background p-4"><p className="text-xs text-muted-foreground">Due reviews</p><p className="mt-2 text-2xl font-semibold text-foreground">3</p><p className="mt-1 text-xs text-secondary">One exam-related topic</p></div><div className="rounded-xl border border-border bg-background p-4"><p className="text-xs text-muted-foreground">Recent progress</p><p className="mt-2 text-sm font-medium text-foreground">Two Sum captured</p><p className="mt-1 text-xs text-secondary">Metadata, accepted status, code</p></div></div>
      </div>
    </div>
  </div>
}

export function LandingPage() {
  return <div className="min-h-dvh overflow-x-hidden bg-background text-secondary">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="Personal Dev KG home" className="flex items-center gap-2 rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><Brain className="h-5 w-5 text-primary" /></span><span className="hidden font-semibold min-[400px]:inline">Personal Dev KG</span></Link>
        <nav aria-label="Landing navigation" className="ml-auto hidden items-center gap-5 text-sm md:flex"><a href="#product" className="hover:text-foreground">Product</a><a href="#how-it-works" className="hover:text-foreground">How it works</a><a href="#security" className="hover:text-foreground">Security</a></nav>
        <div className="ml-auto flex items-center gap-2 md:ml-2"><ThemeToggle /><Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link to="/login">Sign in</Link></Button><Button asChild size="sm"><Link to="/signup" aria-label="Create workspace"><span className="sm:hidden">Create</span><span className="hidden sm:inline">Create workspace</span></Link></Button></div>
      </div>
    </header>

    <main id="main-content" tabIndex={-1} className="outline-none">
      <section className="relative overflow-hidden border-b border-border">
        <div className="landing-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto grid min-w-0 max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-28">
          <div className="min-w-0"><p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">AI-guided learning workspace</p><h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] break-words tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">Track what you learn. Get AI guidance. Remember and apply it.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-secondary">Bring subjects, DSA practice, projects, notes, recall, and progress into one learning operating system. You stay in control of every durable AI-assisted change.</p><div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap"><Button asChild size="lg" className="w-full min-[420px]:w-auto"><Link to="/signup">Create workspace <ArrowRight className="ml-2 h-4 w-4" /></Link></Button><Button asChild size="lg" variant="outline" className="w-full min-[420px]:w-auto"><a href="#product">See the workflow</a></Button></div><div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" />Public signup</span><span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" />Provider-neutral AI</span><span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" />Review-before-write</span></div></div>
          <ProductFlow />
        </div>
      </section>

      <section id="product" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl"><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">One genuine workflow</p><h2 className="mt-3 text-3xl font-semibold text-foreground">From capture to retained insight</h2><p className="mt-3 leading-7 text-secondary">The product loop uses the same source item throughout. Structure is derived for you; AI advice remains evidence-backed and reviewable.</p></div>
        <ol className="mt-10 grid gap-4 md:grid-cols-4">{[
          [FileText, "1. Capture", "Save a note, practice problem, assignment, project, subject, or idea."],
          [Sparkles, "2. Guidance", "Get one grounded next action based on reviews, deadlines, and current work."],
          [RotateCcw, "3. Recall", "Explain the idea from memory before the source is revealed."],
          [CheckCircle2, "4. Retain", "Accept or override the advisory score before confidence changes."],
        ].map(([Icon, title, text]) => { const FlowIcon = Icon as typeof FileText; return <li key={String(title)} className="rounded-xl border border-border bg-surface p-5"><FlowIcon className="h-5 w-5 text-primary" /><h3 className="mt-5 font-semibold text-foreground">{String(title)}</h3><p className="mt-2 text-sm leading-6 text-secondary">{String(text)}</p></li> })}</ol>
      </section>

      <section className="border-y border-border bg-surface-subtle"><div className="mx-auto max-w-7xl px-4 py-20 sm:px-6"><div className="grid gap-5 md:grid-cols-3">{outcomes.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border border-border bg-surface p-6"><Icon className="h-6 w-6 text-primary" /><h2 className="mt-5 text-xl font-semibold text-foreground">{title}</h2><p className="mt-2 leading-7 text-secondary">{text}</p></article>)}</div></div></section>

      <section id="how-it-works" className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">A short operating loop</p><h2 className="mt-3 text-3xl font-semibold text-foreground">Know what matters today without losing the bigger picture</h2><div className="mt-8 space-y-5">{["Home recommends one next action and keeps due reviews and deadlines visible.", "Learn organizes subjects, DSA, recall, and comprehension around outcomes.", "Projects and Library connect delivery to the knowledge that supports it.", "AI Coach advises and proposes; you choose what, if anything, is applied."].map((text, index) => <div key={text} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs text-primary">{index + 1}</span><p className="pt-1 text-sm leading-6 text-secondary">{text}</p></div>)}</div></div>
        <div className="rounded-2xl border border-border bg-surface p-6"><h3 className="font-semibold text-foreground">Focused integrations</h3><p className="mt-2 text-sm leading-6 text-secondary">Integrations add evidence to your workspace without becoming the product itself.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{[[Braces, "LeetCode extension", "Metadata, accepted status, code, and notes captured independently."], [Code2, "Codeforces & CodeChef", "Public-profile practice synchronization."], [Github, "GitHub", "Shipping signals and reviewable TIL drafts."], [Network, "Knowledge graph", "Confirmed connections and canonical evidence."]].map(([Icon, title, text]) => { const IntegrationIcon = Icon as typeof Braces; return <div key={String(title)} className="rounded-xl bg-background p-4"><IntegrationIcon className="h-5 w-5 text-primary" /><p className="mt-3 text-sm font-medium text-foreground">{String(title)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{String(text)}</p></div> })}</div></div>
      </section>

      <section className="border-y border-border bg-surface-subtle"><div className="mx-auto max-w-7xl px-4 py-20 sm:px-6"><div className="max-w-2xl"><div className="flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5" /><span className="font-mono text-xs uppercase tracking-[0.18em]">AI trust</span></div><h2 className="mt-3 text-3xl font-semibold text-foreground">Useful guidance without pretending prompt injection is solved</h2><p className="mt-3 leading-7 text-secondary">Containment is layered across context, evidence, authority, review, and logging.</p></div><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{trust.map((item) => <article key={item.title} className="rounded-xl border border-border bg-surface p-5"><h3 className="font-semibold text-foreground">{item.title}</h3><p className="mt-2 text-sm leading-6 text-secondary">{item.text}</p></article>)}</div></div></section>

      <section id="security" className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]"><div><LockKeyhole className="h-7 w-7 text-primary" /><h2 className="mt-5 text-3xl font-semibold text-foreground">Security and privacy match public signup</h2><p className="mt-3 leading-7 text-secondary">Every workspace is tenant-scoped. Authentication supports verified email, 12-character passwords, rate limits, and Cloudflare Turnstile when configured.</p></div><div className="grid gap-3 sm:grid-cols-2">{["User-scoped imports and extension tokens", "Account data export and self-service deletion", "Sensitive items can be excluded from AI egress", "Provider egress is disclosed in settings", "Revoked extension tokens clear locally on 401", "Security decisions are logged without raw personal content"].map((item) => <div key={item} className="flex gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-secondary"><ShieldCheck className="h-4 w-4 shrink-0 text-success" />{item}</div>)}</div></section>

      <section className="border-y border-border bg-surface-subtle"><div className="mx-auto max-w-4xl px-4 py-20 sm:px-6"><h2 className="text-center text-3xl font-semibold text-foreground">Frequently asked questions</h2><div className="mt-8 space-y-3">{faq.map(([question, answer]) => <details key={question} className="group rounded-xl border border-border bg-surface p-5"><summary className="cursor-pointer list-none font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{question}<span className="float-right text-primary group-open:rotate-45" aria-hidden="true">+</span></summary><p className="mt-3 max-w-3xl text-sm leading-6 text-secondary">{answer}</p></details>)}</div></div></section>

      <section className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6"><Brain className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-5 text-4xl font-semibold text-foreground">Build a learning system that stays yours</h2><p className="mx-auto mt-4 max-w-2xl leading-7 text-secondary">Capture the work, get one clear next step, and confirm what becomes durable knowledge.</p><Button asChild size="lg" className="mt-8"><Link to="/signup">Create workspace <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></section>
    </main>

    <footer className="border-t border-border bg-surface"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-xs text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between"><p>Personal Dev KG — AI-guided learning workspace</p><div className="flex flex-wrap gap-4"><span>Privacy policy: owner review required before launch</span><span>Terms: owner review required before launch</span></div></div></footer>
  </div>
}
