interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'success' | 'info';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode; // extra content (e.g. rejection note input)
}

const VARIANT = {
  danger:  { btn: 'bg-red-500 hover:bg-red-600',    icon: '⚠️', ring: 'border-red-500/30' },
  warning: { btn: 'bg-yellow-500 hover:bg-yellow-600', icon: '⚡', ring: 'border-yellow-500/30' },
  success: { btn: 'bg-green-500 hover:bg-green-600',  icon: '✓',  ring: 'border-green-500/30' },
  info:    { btn: 'bg-blue-500 hover:bg-blue-600',    icon: 'ℹ️', ring: 'border-blue-500/30' },
};

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  variant = 'info', loading = false, onConfirm, onCancel, children,
}: ConfirmDialogProps) {
  if (!open) return null;
  const v = VARIANT[variant];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div
        className={`bg-gray-900 rounded-2xl border ${v.ring} w-full max-w-md shadow-2xl`}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none mt-0.5">{v.icon}</span>
            <div>
              <h2 className="text-white font-bold text-lg leading-snug">{title}</h2>
              <p className="text-gray-400 text-sm mt-1 leading-relaxed">{message}</p>
            </div>
          </div>

          {children && <div>{children}</div>}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 py-2.5 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${v.btn}`}
            >
              {loading ? 'Processing…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
