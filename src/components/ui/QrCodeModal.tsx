import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Download, Printer, QrCode, X } from 'lucide-react'
import type { Machine } from '../../types'
import { usePreferences } from '../../context/PreferencesContext'
import { MachineStatusBadge } from './Badges'

interface QrCodeModalProps {
  machine: Machine
  isOpen: boolean
  onClose: () => void
}

export default function QrCodeModal({ machine, isOpen, onClose }: QrCodeModalProps) {
  const { t, language } = usePreferences()
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [copied, setCopied] = useState(false)

  // Direct URL to machine profile
  const machineUrl = `${window.location.origin}/machines/${encodeURIComponent(machine.id)}`

  useEffect(() => {
    if (!isOpen) return
    QRCode.toDataURL(
      machineUrl,
      {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      },
      (err, url) => {
        if (!err && url) {
          setQrDataUrl(url)
        }
      }
    )
  }, [machineUrl, isOpen])

  if (!isOpen) return null

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(machineUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleDownload = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `QR_Tag_${machine.id}.png`
    a.click()
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="${language === 'ar' ? 'rtl' : 'ltr'}">
        <head>
          <title>${machine.id} - Factory Equipment Tag</title>
          <style>
            @page { size: auto; margin: 10mm; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 20px;
              background: #fff;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            .tag {
              border: 3px solid #0f172a;
              border-radius: 12px;
              padding: 24px;
              width: 380px;
              text-align: center;
              box-sizing: border-box;
            }
            .header {
              font-size: 14px;
              font-weight: 800;
              letter-spacing: 1.5px;
              text-transform: uppercase;
              color: #0284c7;
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 8px;
              margin-bottom: 16px;
            }
            .machine-id {
              font-size: 26px;
              font-weight: 900;
              font-family: monospace;
              letter-spacing: 1px;
              margin-bottom: 4px;
            }
            .machine-name {
              font-size: 16px;
              font-weight: 600;
              color: #334155;
              margin-bottom: 16px;
            }
            .qr-image {
              width: 220px;
              height: 220px;
              margin: 0 auto 16px auto;
              display: block;
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              padding: 8px;
            }
            .meta-grid {
              font-size: 12px;
              text-align: ${language === 'ar' ? 'right' : 'left'};
              background: #f8fafc;
              padding: 12px;
              border-radius: 8px;
              margin-bottom: 12px;
            }
            .meta-row {
              display: flex;
              justify-content: space-between;
              padding: 3px 0;
            }
            .meta-label { color: #64748b; font-weight: 500; }
            .meta-val { font-weight: 700; color: #0f172a; }
            .footer {
              font-size: 10px;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
          </style>
        </head>
        <body>
          <div class="tag">
            <div class="header">PREDICTIVE MAINTENANCE PLATFORM</div>
            <div class="machine-id">${machine.id}</div>
            <div class="machine-name">${machine.name}</div>
            <img class="qr-image" src="${qrDataUrl}" alt="Machine QR" />
            <div class="meta-grid">
              <div class="meta-row">
                <span class="meta-label">Type:</span>
                <span class="meta-val">${machine.type}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Model:</span>
                <span class="meta-val">${machine.model}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Location:</span>
                <span class="meta-val">${machine.location}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Scan Target:</span>
                <span class="meta-val">Telemetry & Work Orders</span>
              </div>
            </div>
            <div class="footer">Scan with technician mobile app or barcode scanner</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-sky-400/30 bg-navy-900 shadow-2xl animate-scaleUp">
        {/* Glow ambient background */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-indigo-500/15 blur-3xl" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/30">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">
                {t('Equipment QR Tag')} · {machine.id}
              </h3>
              <p className="text-[11px] text-ink-faint">
                {t('Factory floor barcode for field technicians')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-navy-800 hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 p-5 text-center">
          {/* Tag Display Box */}
          <div className="mx-auto max-w-[280px] rounded-2xl border border-slate-700/60 bg-white p-4 shadow-xl">
            <div className="mb-2 border-b border-slate-200 pb-2">
              <span className="block text-[10px] font-extrabold uppercase tracking-widest text-sky-700">
                INDUSTRIAL ASSET TAG
              </span>
              <span className="font-mono text-lg font-black text-slate-900">{machine.id}</span>
              <span className="block text-xs font-semibold text-slate-600 truncate">
                {machine.name}
              </span>
            </div>

            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for ${machine.id}`}
                className="mx-auto h-48 w-48 rounded-lg"
              />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center rounded-lg bg-slate-100 text-slate-400 text-xs">
                Generating QR...
              </div>
            )}

            <div className="mt-2.5 rounded-lg bg-slate-50 p-2 text-[10.5px] text-slate-600 text-left">
              <div className="flex justify-between py-0.5">
                <span className="text-slate-400">Type:</span>
                <span className="font-bold text-slate-800">{machine.type}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-400">Location:</span>
                <span className="font-bold text-slate-800">{machine.location}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <MachineStatusBadge status={machine.status ?? 'Operational'} />
            <span className="text-xs text-ink-dim font-mono">{machine.manufacturer}</span>
          </div>

          {/* Quick link display */}
          <div className="flex items-center gap-2 rounded-xl border border-line bg-navy-800/60 px-3 py-2 text-left">
            <input
              type="text"
              readOnly
              value={machineUrl}
              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-ink-dim outline-none"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-1 rounded-lg bg-navy-750 px-2 py-1 text-[11px] font-medium text-sky-300 transition-colors hover:bg-navy-700 hover:text-sky-200"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">{t('Copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>{t('Copy')}</span>
                </>
              )}
            </button>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={handlePrint}
              className="btn-ghost flex items-center justify-center gap-2 py-2.5 text-xs font-semibold"
            >
              <Printer className="h-4 w-4 text-sky-400" />
              <span>{t('Print Equipment Tag')}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="btn-primary flex items-center justify-center gap-2 py-2.5 text-xs font-semibold"
            >
              <Download className="h-4 w-4" />
              <span>{t('Download PNG')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
