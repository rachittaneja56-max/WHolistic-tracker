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
  const base = "h-5 w-5 rounded-sm border border-border"
  if (intensity <= 0) {
    return `${base} bg-background`
  }
  if (accent === "blue") {
    if (intensity < 0.34) {
      return `${base} bg-primary/15`
    }
    if (intensity < 0.67) {
      return `${base} bg-primary/30`
    }
    return `${base} bg-primary/50`
  }
  if (intensity < 0.34) {
    return `${base} bg-warning/15`
  }
  if (intensity < 0.67) {
    return `${base} bg-warning/30`
  }
  return `${base} bg-warning/50`
}

export function HeatmapGrid({ title, description, cells, accent, valueLabel }: HeatmapGridProps) {
  const maxValue = Math.max(...cells.map((cell) => cell.value), 0)

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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

      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <span className="font-mono">0</span>
        <div className="flex items-center gap-2 font-mono">
          <span>low</span>
          <div className="h-3 w-3 rounded-sm border border-border bg-background" />
          <div className={cn("h-3 w-3 rounded-sm border border-border", accent === "blue" ? "bg-primary/15" : "bg-warning/15")} />
          <div className={cn("h-3 w-3 rounded-sm border border-border", accent === "blue" ? "bg-primary/30" : "bg-warning/30")} />
          <div className={cn("h-3 w-3 rounded-sm border border-border", accent === "blue" ? "bg-primary/50" : "bg-warning/50")} />
          <span>high</span>
        </div>
        <span className="font-mono">max {maxValue}</span>
      </div>
    </div>
  )
}
