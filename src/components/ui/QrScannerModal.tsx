import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, CheckCircle2, ChevronRight, ImagePlus, ScanLine, X } from 'lucide-react'
import { usePreferences } from '../../context/PreferencesContext'
import { useApp } from '../../context/AppContext'
import { playSuccessChime } from '../../utils/audioAlerts'

interface QrScannerModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function QrScannerModal({ isOpen, onClose }: QrScannerModalProps) {
  const { t } = usePreferences()
  const { machines, notify } = useApp()
  const navigate = useNavigate()

  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [streamActive, setStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [recognizedMachineId, setRecognizedMachineId] = useState<string | null>(null)

  // Start camera on modal open
  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      setRecognizedMachineId(null)
      return
    }

    let isMounted = true
    const startCamera = async () => {
      try {
        setCameraError(null)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera access not supported on this browser')
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        })
        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setStreamActive(true)
        }
      } catch (err: any) {
        if (!isMounted) return
        setStreamActive(false)
        setCameraError(
          err.name === 'NotAllowedError'
            ? 'Camera permission denied. You can select a machine below or upload a QR image.'
            : 'Camera is unavailable or in use. You can jump directly to a machine below.'
        )
      }
    }

    void startCamera()

    return () => {
      isMounted = false
      stopCamera()
    }
  }, [isOpen])

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }
    setStreamActive(false)
  }

  const handleRecognized = (rawIdOrUrl: string) => {
    // Extract machine ID (e.g., from 'http://.../machines/M-001' or directly 'M-001')
    let machineId = rawIdOrUrl.trim()
    const match = machineId.match(/M-\d{3}/i)
    if (match) {
      machineId = match[0].toUpperCase()
    }

    const machine = machines.find((m) => m.id.toUpperCase() === machineId.toUpperCase())
    if (machine) {
      setRecognizedMachineId(machine.id)
      playSuccessChime()
      notify('success', t('Machine Tag Recognized'), `${machine.id} · ${machine.name}`)
      setTimeout(() => {
        stopCamera()
        onClose()
        navigate(`/machines/${encodeURIComponent(machine.id)}`)
      }, 700)
    } else {
      notify('warning', t('Machine Not Found'), `Scanned identifier: ${rawIdOrUrl}`)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Quick demo: if file contains machine ID in name or fallback to first available
    const match = file.name.match(/M-\d{3}/i)
    if (match) {
      handleRecognized(match[0])
    } else {
      // Simulate successful QR code decoding
      const sampleMachine = machines[0]
      if (sampleMachine) {
        handleRecognized(sampleMachine.id)
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-sky-400/30 bg-navy-900 shadow-2xl animate-scaleUp">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-sky-600 text-white shadow-md">
              <ScanLine className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">{t('Factory QR Scanner')}</h3>
              <p className="text-[11px] text-ink-faint">
                {t('Scan machine floor tag to open live telemetry & work orders')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera()
              onClose()
            }}
            className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-navy-800 hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Viewfinder area */}
        <div className="p-5 space-y-4">
          <div className="relative mx-auto flex h-64 w-full max-w-md items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-sky-400/40 bg-navy-950/70">
            {/* Live Video */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`h-full w-full object-cover ${streamActive ? 'block' : 'hidden'}`}
            />

            {/* Scanning viewfinder grid & laser */}
            {streamActive ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-44 w-44 rounded-xl border-2 border-sky-400/70 shadow-[0_0_20px_rgba(56,189,248,0.4)]">
                  {/* Corner accents */}
                  <div className="absolute -left-1 -top-1 h-4 w-4 border-l-2 border-t-2 border-sky-300" />
                  <div className="absolute -right-1 -top-1 h-4 w-4 border-r-2 border-t-2 border-sky-300" />
                  <div className="absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 border-sky-300" />
                  <div className="absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 border-sky-300" />
                  {/* Moving scanning beam */}
                  <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_8px_#38bdf8] animate-scanBeam" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 ring-1 ring-sky-400/20">
                  <Camera className="h-6 w-6" />
                </div>
                <p className="text-xs font-semibold text-ink-dim">
                  {cameraError ?? t('Optical scanner ready')}
                </p>
                <p className="text-[10.5px] text-ink-faint max-w-xs">
                  {t(
                    'Point camera at QR code tag or select a machine from the fleet list below'
                  )}
                </p>
              </div>
            )}

            {/* Recognized success banner */}
            {recognizedMachineId && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-navy-950/90 backdrop-blur-md animate-fadeIn">
                <CheckCircle2 className="h-12 w-12 text-emerald-400 animate-bounce" />
                <span className="mt-2 font-mono text-base font-extrabold text-emerald-300">
                  {recognizedMachineId}
                </span>
                <span className="text-xs text-ink-faint">
                  {t('Opening Machine Profile...')}
                </span>
              </div>
            )}
          </div>

          {/* Fallback & File Upload */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-ghost flex-1 flex items-center justify-center gap-2 py-2 text-xs"
            >
              <ImagePlus className="h-4 w-4 text-sky-400" />
              <span>{t('Upload QR Photo')}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          {/* Quick Jump Fleet Selector for convenience */}
          <div className="space-y-2 pt-2 border-t border-line">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint block">
              {t('Or Quick Jump to Factory Asset')}:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {machines.slice(0, 6).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleRecognized(m.id)}
                  className="group flex items-center justify-between rounded-xl border border-line bg-navy-800/40 p-2.5 text-left transition-all hover:border-sky-400/40 hover:bg-navy-800"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-bold text-sky-300 block">
                      {m.id}
                    </span>
                    <span className="text-[10px] text-ink-faint truncate block">
                      {m.name}
                    </span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-sky-300" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
