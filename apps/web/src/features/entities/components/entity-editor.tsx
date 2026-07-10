import { Suspense, lazy, useMemo } from "react"
import { BlockNoteViewRaw, useCreateBlockNote } from "@blocknote/react"
import ReactMarkdown from "react-markdown"

import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import type { ContentType } from "@/lib/api"
import { parseBlockNoteContent, parseCanvasContent, serializeBlockNoteContent, serializeCanvasContent } from "@/features/entities/content"

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
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        {value.trim() ? (
          <div className="space-y-3 text-sm leading-7 text-zinc-300 [&_a]:text-blue-300 [&_code]:rounded [&_code]:bg-zinc-900 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-zinc-100 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_li]:ml-5 [&_li]:list-disc [&_p]:text-zinc-300 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:bg-zinc-900 [&_pre]:p-3 [&_pre]:font-mono [&_strong]:text-zinc-100">
            <ReactMarkdown>{value}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Markdown preview will appear here.</p>
        )}
      </div>
    </div>
  )
}

function CodeEntityEditor({ value, onChange }: { value: string; onChange: (nextValue: string) => void }) {
  return <Textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="Write code content here." className="min-h-[320px] font-mono text-xs" />
}

function BlockNoteEntityEditor({ value, onChange }: { value: string; onChange: (nextValue: string) => void }) {
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
        <p className="text-sm text-zinc-500">This entity has block content that could not be parsed safely. Edit the raw JSON below to recover it.</p>
        <Textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-[260px] font-mono text-xs" />
      </div>
    )
  }

  return (
    <div className="kg-rich-editor rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <BlockNoteViewRaw editor={editor} theme="dark" onChange={() => onChange(serializeBlockNoteContent(editor.document))} className="min-h-[360px]" />
    </div>
  )
}

function CanvasEntityEditor({ value, onChange }: { value: string; onChange: (nextValue: string) => void }) {
  const parsed = useMemo(() => parseCanvasContent(value), [value])

  if (parsed.invalid) {
    return (
      <div className="space-y-3">
        <Badge variant="warning">Invalid canvas JSON</Badge>
        <p className="text-sm text-zinc-500">This entity has canvas content that could not be parsed safely. Edit the raw JSON below to recover it.</p>
        <Textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-[260px] font-mono text-xs" />
      </div>
    )
  }

  const excalidrawProps: ExcalidrawComponentProps = {
    initialData: parsed.document as unknown as ExcalidrawComponentProps["initialData"],
    theme: "dark",
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
    <div className="kg-excalidraw rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <Suspense fallback={<div className="flex min-h-[520px] items-center justify-center text-sm text-zinc-500">Loading canvas editor...</div>}>
        <div className="h-[520px] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
          <LazyExcalidraw {...excalidrawProps} />
        </div>
      </Suspense>
    </div>
  )
}

