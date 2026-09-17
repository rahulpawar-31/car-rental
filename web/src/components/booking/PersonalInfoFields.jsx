import { User, Mail, Phone } from 'lucide-react'

export default function PersonalInfoFields({
  idPrefix,
  name,
  onNameChange,
  email,
  onEmailChange,
  phone,
  onPhoneChange,
}) {
  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor={`${idPrefix}-name`}
          className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5"
        >
          Full Name
        </label>
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2.5 focus-within:border-teal-400 transition-colors">
          <User className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            id={`${idPrefix}-name`}
            type="text"
            required
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="John Doe"
            className="flex-1 text-sm outline-none text-gray-800 bg-transparent"
          />
        </div>
      </div>
      <div>
        <label
          htmlFor={`${idPrefix}-email`}
          className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5"
        >
          Email Address
        </label>
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2.5 focus-within:border-teal-400 transition-colors">
          <Mail className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            id={`${idPrefix}-email`}
            type="email"
            required
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            placeholder="john@example.com"
            className="flex-1 text-sm outline-none text-gray-800 bg-transparent"
          />
        </div>
      </div>
      <div>
        <label
          htmlFor={`${idPrefix}-phone`}
          className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5"
        >
          Phone Number
        </label>
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2.5 focus-within:border-teal-400 transition-colors">
          <Phone className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            id={`${idPrefix}-phone`}
            type="tel"
            value={phone}
            onChange={e => onPhoneChange(e.target.value)}
            placeholder="+91 98765 43210"
            className="flex-1 text-sm outline-none text-gray-800 bg-transparent"
          />
        </div>
      </div>
    </div>
  )
}
