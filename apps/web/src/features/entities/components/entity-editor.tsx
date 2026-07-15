import "@blocknote/react/style.css"
import "@excalidraw/excalidraw/index.css"

import { Suspense, lazy, useMemo } from "react"
import { BlockNoteViewRaw, useCreateBlockNote } from "@blocknote/react"
import ReactMarkdown from "react-markdown"

import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import type { ContentType } from "@/lib/api"
import { parseBlockNoteContent, parseCanvasContent, serializeBlockNoteContent, serializeCanvasContent } from "@/features/entities/content"
import { useTheme } from "@/features/theme/theme-provider"

const LazyExcalidraw = lazy(async () => {
  const module = await import("@excalidraw/excalidraw")
  return { default: module.Excalidraw }
})

type ExcalidrawComponentProps = React.ComponentProps<typeof LazyExcalidraw>

type EntityEditorProps = {
  contentType: ContentType | null
  value: string
  onChange: (nextValue: string) => void
  resetKey: string
}

export function EntityEditor({ contentType, value, onChange, resetKey }: EntityEditorProps) {
  if (contentType === "blocks") {
    return <BlockNoteEntityEditor key={resetKey} value={value} onChange={onChange} />
  }

  if (contentType === "canvas_json") {
    return <CanvasEntityEditor key={resetKey} value={value} onChange={onChange} />
  }

  if (contentType === "code") {
    return <CodeEntityEditor value={value} onChange={onChange} />
  }

  return <MarkdownEntityEditor value={value} onChange={onChange} />
}

function MarkdownEntityEditor({ value, onChange }: { value: string; onChange: (nextValue: string) => void }) {
  return (
    <div className="space-y-4">
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="Write markdown content here." className="min-h-[220px]" />
      <div className="rounded-lg border border-border bg-background p-4">
        {value.trim() ? (
          <div className="space-y-3 text-sm leading-7 text-secondary [&_a]:text-primary [&_code]:rounded [&_code]:bg-surface [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p]:text-secondary [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-surface [&_pre]:p-3 [&_pre]:font-mono [&_strong]:text-foreground">
            <ReactMarkdown>{value}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Markdown preview will appear here.</p>
        )}
      </div>
    </div>
  )
}

function CodeEntityEditor({ value, onChange }: { value: string; onChange: (nextValue: string) => void }) {
  return <Textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="Write code content here." className="min-h-[320px] font-mono text-xs" />
}

function BlockNoteEntityEditor({ value, onChange }: { value: string; onChange: (nextValue: string) => void }) {
  const { resolvedTheme } = useTheme()
  const parsed = useMemo(() => parseBlockNoteContent(value), [value])
  const editor = useCreateBlockNote(
    {
      initialContent: parsed.blocks as Parameters<typeof useCreateBlockNote>[0] extends { initialContent?: infer T } ? T : never,
    },
    [],
  )

  if (parsed.invalid) {
    return (
      <div className="space-y-3">
        <Badge variant="warning">Invalid block JSON</Badge>
        <p className="text-sm text-muted-foreground">This entity has block content that could not be parsed safely. Edit the raw JSON below to recover it.</p>
        <Textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-[260px] font-mono text-xs" />
      </div>
    )
  }

  return (
    <div className="kg-rich-editor rounded-lg border border-border bg-surface p-3">
      <BlockNoteViewRaw editor={editor} theme={resolvedTheme} onChange={() => onChange(serializeBlockNoteContent(editor.document))} className="min-h-[360px]" />
    </div>
  )
}

function CanvasEntityEditor({ value, onChange }: { value: string; onChange: (nextValue: string) => void }) {
  const { resolvedTheme } = useTheme()
  const parsed = useMemo(() => parseCanvasContent(value), [value])

  if (parsed.invalid) {
    return (
      <div className="space-y-3">
        <Badge variant="warning">Invalid canvas JSON</Badge>
        <p className="text-sm text-muted-foreground">This entity has canvas content that could not be parsed safely. Edit the raw JSON below to recover it.</p>
        <Textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-[260px] font-mono text-xs" />
      </div>
    )
  }

  const initialData = {
    ...parsed.document,
    appState: {
      ...parsed.document.appState,
      theme: resolvedTheme,
      viewBackgroundColor: resolvedTheme === "dark" ? "#080d18" : "#f8fafc",
    },
  }
  const excalidrawProps: ExcalidrawComponentProps = {
    initialData: initialData as unknown as ExcalidrawComponentProps["initialData"],
    theme: resolvedTheme,
    gridModeEnabled: false,
    viewModeEnabled: false,
    zenModeEnabled: false,
    onChange: (elements: readonly unknown[], appState: unknown, files: unknown) => {
      onChange(serializeCanvasContent(elements, (appState ?? {}) as Record<string, unknown>, (files ?? {}) as Record<string, unknown>))
    },
    UIOptions: {
      canvasActions: {
        saveToActiveFile: false,
        loadScene: false,
        export: false,
        clearCanvas: true,
        toggleTheme: false,
      },
    },
  }

  return (
    <div className="kg-excalidraw rounded-lg border border-border bg-surface p-3">
      <Suspense fallback={<div className="flex min-h-[520px] items-center justify-center text-sm text-muted-foreground">Loading canvas editor...</div>}>
        <div className="h-[520px] overflow-hidden rounded-lg border border-border bg-background">
          <LazyExcalidraw {...excalidrawProps} />
        </div>
      </Suspense>
    </div>
  )
}

