import type { Entity } from "@/lib/api"

export type EntitiesLayoutContext = {
  entities: Entity[]
  isEntitiesLoading: boolean
  entitiesError: string | null
  refreshEntities: () => Promise<void>
  addEntityToList: (entity: Entity) => void
  upsertEntityInList: (entity: Entity) => void
}
