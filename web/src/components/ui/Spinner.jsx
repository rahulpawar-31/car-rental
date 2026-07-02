export default function Spinner({ size = 'md', className = '' }) {
  const sizes = { xs: 'w-3 h-3', sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return (
    <div className={`${sizes[size]} border-2 border-gray-200 border-t-teal-500 rounded-full animate-spin ${className}`} />
  )
}
