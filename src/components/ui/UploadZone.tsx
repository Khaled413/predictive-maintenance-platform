import React, { useRef, useState } from 'react'
import { FileUp, UploadCloud } from 'lucide-react'
import { cx } from '../../utils/helpers'

interface UploadZoneProps {
  accept: string
  label: string
  hint?: string
  onFile: (file: File) => void
  icon?: React.ReactNode
  compact?: boolean
}

export default function UploadZone({
  accept,
  label,
  hint,
  onFile,
  icon,
  compact,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0]
    if (f) onFile(f)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={cx(
        'group flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-all duration-200',
        compact ? 'px-4 py-5' : 'px-6 py-10',
        drag
          ? 'border-sky-400/70 bg-sky-500/10'
          : 'border-line bg-navy-900/40 hover:border-sky-400/40 hover:bg-navy-800/50'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <div
        className={cx(
          'flex items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-105',
          compact ? 'h-9 w-9' : 'h-12 w-12',
          drag
            ? 'bg-sky-500/20 ring-sky-400/40 text-sky-300'
            : 'bg-navy-700/60 ring-line text-sky-400'
        )}
      >
        {icon ?? (
          <UploadCloud
            className={compact ? 'h-4.5 w-4.5 h-[18px] w-[18px]' : 'h-6 w-6'}
          />
        )}
      </div>
      <p
        className={cx(
          'font-semibold text-ink',
          compact ? 'mt-2 text-[12px]' : 'mt-3 text-[13px]'
        )}
      >
        {label}
      </p>
      {hint && <p className="mt-1 text-[11px] text-ink-faint">{hint}</p>}
      <span className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-sky-400/80">
        <FileUp className="h-3 w-3" />
        Browse files ·{' '}
        <span className="font-mono normal-case tracking-normal">
          {accept.replace(/,/g, ' / ')}
        </span>
      </span>
    </div>
  )
}
