import { Link } from 'react-router-dom'

/**
 * Shared layout for the Privacy and Terms pages: a title, a "last updated" line, an intro and a
 * list of titled sections. Section bodies are arrays of paragraphs; an item that is itself an
 * array is rendered as a bullet list.
 */
export default function LegalPage({ title, updated, intro, sections }) {
  return (
    <div className="bg-white min-h-screen">
      <div className="bg-gray-900 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
          <h1 className="text-3xl md:text-4xl font-extrabold mb-2">{title}</h1>
          <p className="text-sm text-gray-400">Last updated {updated}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <p className="text-gray-600 leading-relaxed mb-10">{intro}</p>

        <div className="space-y-9">
          {sections.map(section => (
            <section key={section.heading}>
              <h2 className="text-xl font-bold text-gray-900 mb-3">{section.heading}</h2>
              <div className="space-y-3 text-gray-600 leading-relaxed">
                {section.body.map((block, i) =>
                  Array.isArray(block) ? (
                    <ul key={i} className="list-disc pl-5 space-y-1.5">
                      {block.map(item => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p key={i}>{block}</p>
                  )
                )}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-gray-200 text-sm text-gray-500 flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/contact" className="text-teal-600 hover:underline">
            Contact us
          </Link>
          <Link to="/privacy" className="text-teal-600 hover:underline">
            Privacy Policy
          </Link>
          <Link to="/terms" className="text-teal-600 hover:underline">
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  )
}
