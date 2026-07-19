import { describe, expect, it } from "vitest"

import { destinationForGuidance } from "@/features/guidance/guidance-routing"
import type { DailyGuidanceAction, GuidanceActionKind } from "@/lib/api"

const destinations: Record<GuidanceActionKind, string> = {
  start_recall: "/knowledge/recall?entity=entity-1",
  open_task: "/knowledge/entities/entity-1",
  open_project: "/trackers/projects/entity-1",
  study_subject: "/trackers/subjects/entity-1",
  review_connection: "/agents/review-inbox",
  open_comprehension: "/knowledge/recall/comprehension",
}

describe("destinationForGuidance", () => {
  it.each(Object.entries(destinations))("routes %s to its typed workflow", (actionKind, destination) => {
    const action: DailyGuidanceAction = {
      action_kind: actionKind as GuidanceActionKind,
      entity_id: "entity-1",
      label: "Act",
      reason: "Because it is due.",
      priority: "high",
    }

    expect(destinationForGuidance(action)).toBe(destination)
  })
})
