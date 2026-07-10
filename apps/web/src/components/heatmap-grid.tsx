import { cn } from "@/lib/utils"

type HeatmapCell = {
  date: string
  value: number
}

type HeatmapGridProps = {
  title: string
  description: string
  cells: HeatmapCell[]
  accent: "blue" | "amber"
  valueLabel: string
}

function getCellClasses(accent: HeatmapGridProps["accent"], intensity: number) {
  const base = "h-5 w-5 rounded-sm border border-zinc-800"
  if (intensity <= 0) {
    return `${base} bg-zinc-950`
  }
  if (accent === "blue") {
    if (intensity < 0.34) {
      return `${base} bg-blue-500/15`
    }
    if (intensity < 0.67) {
      return `${base} bg-blue-500/30`
    }
    return `${base} bg-blue-500/50`
  }
  if (intensity < 0.34) {
    return `${base} bg-amber-500/15`
  }
  if (intensity < 0.67) {
    return `${base} bg-amber-500/30`
  }
  return `${base} bg-amber-500/50`
}

export function HeatmapGrid({ title, description, cells, accent, valueLabel }: HeatmapGridProps) {
  const maxValue = Math.max(...cells.map((cell) => cell.value), 0)

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-zinc-100">{title}</p>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>

      <div className="grid grid-cols-7 gap-2 sm:grid-cols-12 lg:grid-cols-14 xl:grid-cols-21">
        {cells.map((cell) => {
          const intensity = maxValue > 0 ? cell.value / maxValue : 0
          return (
            <div key={cell.date} className="space-y-1">
              <div
                className={cn(getCellClasses(accent, intensity))}
                title={`${cell.date}: ${cell.value} ${valueLabel}`}
                aria-label={`${cell.date}: ${cell.value} ${valueLabel}`}
              />
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-4 text-xs text-zinc-500">
        <span className="font-mono">0</span>
        <div className="flex items-center gap-2 font-mono">
          <span>low</span>
          <div className="h-3 w-3 rounded-sm border border-zinc-800 bg-zinc-950" />
          <div className={cn("h-3 w-3 rounded-sm border border-zinc-800", accent === "blue" ? "bg-blue-500/15" : "bg-amber-500/15")} />
          <div className={cn("h-3 w-3 rounded-sm border border-zinc-800", accent === "blue" ? "bg-blue-500/30" : "bg-amber-500/30")} />
          <div className={cn("h-3 w-3 rounded-sm border border-zinc-800", accent === "blue" ? "bg-blue-500/50" : "bg-amber-500/50")} />
          <span>high</span>
        </div>
        <span className="font-mono">max {maxValue}</span>
      </div>
    </div>
  )
}
