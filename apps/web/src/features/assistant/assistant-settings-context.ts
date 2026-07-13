import { createContext, useContext } from "react"

import type { SettingsStatus } from "@/lib/system-api"

export const AssistantSettingsContext = createContext<SettingsStatus | null | undefined>(undefined)

export function useAssistantSettings() {
  return useContext(AssistantSettingsContext)
}
