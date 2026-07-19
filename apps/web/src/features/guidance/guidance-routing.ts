import type { DailyGuidanceAction } from "@/lib/api"

export function destinationForGuidance(action: DailyGuidanceAction): string {
  switch (action.action_kind) {
    case "start_recall":
      return action.entity_id ? `/knowledge/recall?entity=${action.entity_id}` : "/knowledge/recall"
    case "open_task":
      return action.entity_id ? `/knowledge/entities/${action.entity_id}` : "/trackers/projects"
    case "open_project":
      return action.entity_id ? `/trackers/projects/${action.entity_id}` : "/trackers/projects"
    case "study_subject":
      return action.entity_id ? `/trackers/subjects/${action.entity_id}` : "/trackers/subjects"
    case "review_connection":
      return "/agents/review-inbox"
    case "open_comprehension":
      return "/knowledge/recall/comprehension"
  }
}
