import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Share2, Bookmark } from 'lucide-react'
import { FaFacebookF, FaTwitter, FaYoutube, FaInstagram } from 'react-icons/fa'
import { toast } from 'sonner'
import { ARTICLES } from '../data/articles'
import Button from '../components/ui/Button'

function BlogImage({ src, alt, className }) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 text-gray-300 text-5xl ${className || ''}`}
      >
        📰
      </div>
    )
  }
  return (
    <img src={src} alt={alt || ''} className={className || ''} onError={() => setError(true)} />
  )
}

export default function BlogPost() {
  const { id } = useParams()
  const article = ARTICLES.find(a => a.id === parseInt(id))

  const [comment, setComment] = useState('')
  const [commenterName, setCommenterName] = useState('')
  const [commenterEmail, setCommenterEmail] = useState('')
  const [saveInfo, setSaveInfo] = useState(false)
  const [newsletterEmail, setNewsletterEmail] = useState('')

  if (!article) {
    return (
      <div className="text-center py-24">
        <div className="text-6xl mb-4">📰</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Article not found</h1>
        <Link to="/home" className="text-teal-600 underline text-sm">
          Go home
        </Link>
      </div>
    )
  }

  const relatedArticles = ARTICLES.filter(a => article.relatedIds.includes(a.id))
  const recentArticles = ARTICLES.filter(a => a.id !== article.id)
  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl)
      toast.success('Link copied to clipboard!')
    }
  }

  const handleCommentSubmit = e => {
    e.preventDefault()
    toast.success('Your comment has been submitted for review!')
    setComment('')
    setCommenterName('')
    setCommenterEmail('')
    setSaveInfo(false)
  }

  const handleNewsletterSubmit = e => {
    e.preventDefault()
    toast.success('Subscribed! Thank you.')
    setNewsletterEmail('')
  }

  const SOCIAL = [
    { label: 'Facebook', Icon: FaFacebookF },
    { label: 'Twitter', Icon: FaTwitter },
    { label: 'YouTube', Icon: FaYoutube },
    { label: 'Instagram', Icon: FaInstagram },
  ]

  return (
    <div className="bg-white min-h-screen">
      {/* Hero */}
      <div className="relative h-[420px] md:h-[540px] overflow-hidden bg-gray-900">
        <BlogImage
          src={article.image}
          alt={article.title}
          className="absolute inset-0 w-full h-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/80" />
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-14 text-center px-4">
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight drop-shadow-lg max-w-4xl">
            {article.title}
          </h1>
          <p className="text-gray-300 text-sm mt-3 uppercase tracking-widest font-medium">
            {article.date} &bull; 0 Comments
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* ── Main Article ─────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {article.content.map((section, i) => {
              if (section.type === 'text') {
                return (
                  <p key={i} className="text-gray-600 leading-relaxed mb-6 text-base">
                    {section.body}
                  </p>
                )
              }
              if (section.type === 'image') {
                return (
                  <figure key={i} className="my-8">
                    <BlogImage
                      src={section.src}
                      alt={section.caption || ''}
                      className="w-full object-cover rounded-lg"
                    />
                    {section.caption && (
                      <figcaption className="text-center text-sm text-gray-400 mt-3 italic">
                        {section.caption}
                      </figcaption>
                    )}
                  </figure>
                )
              }
              if (section.type === 'quote') {
                return (
                  <div key={i} className="my-12">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-px bg-teal-300" />
                      <Bookmark className="w-7 h-7 text-teal-500 fill-teal-500 shrink-0" />
                      <div className="flex-1 h-px bg-teal-300" />
                    </div>
                    <blockquote className="text-center text-2xl md:text-3xl font-bold text-gray-900 leading-snug px-4 mt-8 mb-8">
                      {section.body}
                    </blockquote>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-px bg-teal-300" />
                      <Bookmark className="w-7 h-7 text-teal-500 fill-teal-500 shrink-0" />
                      <div className="flex-1 h-px bg-teal-300" />
                    </div>
                  </div>
                )
              }
              return null
            })}

            {/* Tags + Share */}
            <div className="flex items-center justify-between flex-wrap gap-3 mt-8 pt-6 border-t border-gray-100">
              <div className="flex flex-wrap gap-2">
                {article.tags.map(tag => (
                  <span
                    key={tag}
                    className="text-sm text-gray-600 border border-gray-300 rounded-full px-4 py-1 hover:border-teal-400 hover:text-teal-600 cursor-default transition-colors"
                  >
                    #{tag.toUpperCase().replace(/ /g, '_')}
                  </span>
                ))}
              </div>
              <button
                onClick={handleShare}
                className="w-10 h-10 rounded-full bg-teal-500 hover:bg-teal-600 flex items-center justify-center text-white transition-colors shrink-0"
                title="Share this article"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>

            {/* Author */}
            <div className="mt-8 p-6 border border-gray-200 rounded-2xl flex items-start gap-5">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 shrink-0 ring-2 ring-teal-100">
                <BlogImage
                  src={article.author.avatar}
                  alt={article.author.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-semibold">
                  Posted By
                </p>
                <p className="font-bold text-gray-900 text-lg mb-2">{article.author.name}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{article.author.bio}</p>
              </div>
            </div>

            {/* You might also like */}
            {relatedArticles.length > 0 && (
              <div className="mt-12">
                <h2 className="text-xl font-bold text-gray-900 mb-6">You might also like</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                  {relatedArticles.map(rel => (
                    <Link key={rel.id} to={`/blog/${rel.id}`} className="group">
                      <div className="h-40 bg-gray-200 overflow-hidden mb-3 rounded-lg">
                        <BlogImage
                          src={rel.image}
                          alt={rel.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                      <p className="text-xs text-gray-400 uppercase tracking-widest mb-1.5">
                        {rel.date}
                      </p>
                      <h3 className="text-sm font-bold text-gray-900 group-hover:text-teal-600 transition-colors leading-snug">
                        {rel.title}
                      </h3>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Leave A Reply */}
            <div className="mt-12 pt-8 border-t border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Leave A Reply</h2>
              <form onSubmit={handleCommentSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Comment <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    required
                    rows={7}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-y text-gray-700 placeholder-gray-400"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={commenterName}
                      onChange={e => setCommenterName(e.target.value)}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={commenterEmail}
                      onChange={e => setCommenterEmail(e.target.value)}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Website
                    </label>
                    <input
                      type="url"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="saveInfo"
                    checked={saveInfo}
                    onChange={e => setSaveInfo(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-teal-500 focus:ring-teal-400"
                  />
                  <label htmlFor="saveInfo" className="text-sm text-gray-600 cursor-pointer">
                    Save my name, email, and website in this browser for the next time I comment.
                  </label>
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="uppercase tracking-wide"
                >
                  Post Reply
                </Button>
              </form>
            </div>
          </div>

          {/* ── Sidebar ───────────────────────────────────────────── */}
          <div className="w-full lg:w-72 xl:w-80 shrink-0">
            <div className="space-y-8 lg:sticky lg:top-24">
              {/* Newsletter */}
              <div className="border border-gray-200 rounded-2xl p-5">
                <h3 className="text-lg font-bold text-gray-900 mb-1">Newsletter</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Don't miss a thing! Sign up to receive daily deals
                </p>
                <form onSubmit={handleNewsletterSubmit} className="space-y-2.5">
                  <input
                    type="email"
                    value={newsletterEmail}
                    onChange={e => setNewsletterEmail(e.target.value)}
                    required
                    placeholder="Your Email Address"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder-gray-400"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full uppercase tracking-wider"
                  >
                    Subscribe
                  </Button>
                </form>
              </div>

              {/* Recent Posts */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-5 pb-3 border-b border-gray-200">
                  Recent Posts
                </h3>
                <div className="space-y-5">
                  {recentArticles.map(a => (
                    <Link key={a.id} to={`/blog/${a.id}`} className="flex gap-3 group">
                      <div className="w-16 h-14 bg-gray-200 rounded-lg overflow-hidden shrink-0">
                        <BlogImage
                          src={a.image}
                          alt={a.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400 mb-1">{a.date}</p>
                        <p className="text-sm font-semibold text-gray-800 group-hover:text-teal-600 transition-colors leading-snug line-clamp-2">
                          {a.title}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Connect with Us */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4 pb-3 border-b border-gray-200">
                  Connect with Us
                </h3>
                <div className="flex items-center gap-2.5 flex-wrap">
                  {SOCIAL.map(({ label, Icon }) => (
                    <a
                      key={label}
                      href="#"
                      onClick={e => e.preventDefault()}
                      aria-label={label}
                      className="w-9 h-9 rounded-full border border-gray-200 text-gray-500 flex items-center justify-center hover:border-teal-400 hover:text-teal-500 transition-colors"
                    >
                      <Icon size={13} />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
