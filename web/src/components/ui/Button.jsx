const VARIANT_CLASSES = {
  primary: 'bg-teal-500 hover:bg-teal-600 text-white font-bold',
  secondary: 'bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold',
  outline: 'bg-transparent border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium',
  danger: 'bg-red-500 hover:bg-red-600 text-white font-bold',
}

const SIZE_CLASSES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-6 py-2.5 text-sm',
  lg: 'px-8 py-3 text-base',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'inline-flex items-center justify-center gap-2 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  )
}
