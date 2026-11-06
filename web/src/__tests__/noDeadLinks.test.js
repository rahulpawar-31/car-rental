// Placeholder links (href="#") go nowhere and, with a preventDefault handler, look like a bug
// to anyone who clicks them. Social, Privacy and Terms links were removed until real URLs and
// pages exist; this keeps any page or component from bringing one back.
const sources = import.meta.glob(['../**/*.jsx', '!../__tests__/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('placeholder links', () => {
  test('finds the source files it is meant to check', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20)
  })

  test('no component links to "#"', () => {
    const offenders = Object.entries(sources)
      .filter(([, code]) => /href=(["'])#\1|href=\{\s*(["'`])#\2\s*\}/.test(code))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })
})
