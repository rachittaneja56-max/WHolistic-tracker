import { useNavigate, useSearchParams } from "react-router-dom"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AssistantWorkspace } from "@/features/assistant/assistant-workspace"
import { GraphChatPage } from "@/pages/graph-chat-page"
import { IdeasPage } from "@/pages/ideas-page"
import { ReviewInboxPage } from "@/pages/review-inbox-page"

type WorkspaceView = "chat" | "ask-graph" | "review-inbox" | "ideas"

const views: Array<{ id: WorkspaceView; label: string; description: string }> = [
  { id: "chat", label: "Chat", description: "Ask questions, capture work, plan changes, and run recall." },
  { id: "ask-graph", label: "Ask Graph", description: "Get answers grounded only in your saved knowledge and links." },
  { id: "review-inbox", label: "Review Inbox", description: "Confirm or reject AI-suggested relationships before they enter your graph." },
  { id: "ideas", label: "Ideas", description: "Validate a product idea against your existing knowledge before saving it." },
]

export function AssistantPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const rawView = searchParams.get("view")
  const view: WorkspaceView = views.some((item) => item.id === rawView) ? rawView as WorkspaceView : "chat"

  function href(nextView: WorkspaceView) {
    const next = new URLSearchParams(searchParams)
    if (nextView === "chat") next.delete("view")
    else next.set("view", nextView)
    const query = next.toString()
    return `/agents/assistant${query ? `?${query}` : ""}`
  }

  const sectionControl = <Select value={view} onValueChange={(nextView) => navigate(href(nextView as WorkspaceView))}>
    <SelectTrigger className="h-9 w-[152px]" aria-label="AI Workspace section">
      <SelectValue />
    </SelectTrigger>
    <SelectContent align="end">
      {views.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
    </SelectContent>
  </Select>

  if (view === "chat") return <AssistantWorkspace sectionControl={sectionControl} />
  if (view === "ask-graph") return <GraphChatPage sectionControl={sectionControl} />
  if (view === "review-inbox") return <ReviewInboxPage sectionControl={sectionControl} />
  return <IdeasPage sectionControl={sectionControl} />
}
