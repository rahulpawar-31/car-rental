import { X } from 'lucide-react'

export default function Modal({ title, onClose, maxWidth = 'max-w-lg', children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} aria-label="Close">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
