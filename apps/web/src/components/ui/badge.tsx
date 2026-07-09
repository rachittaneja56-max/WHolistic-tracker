import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva("inline-flex items-center rounded-md border px-2 py-1 font-mono text-xs", {
  variants: {
    variant: {
      default: "border-zinc-800 bg-zinc-950 text-zinc-300",
      blue: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }
