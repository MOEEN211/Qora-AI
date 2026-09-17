import { legal } from "@/config/legal"
export function LegalPage({ kind }: { kind: keyof typeof legal }) {
  const document = legal[kind]
  return (
    <div className="marketing-container">
      <header className="legal-heading">
        <span className="journal-eyebrow">Legal · Sample document</span>
        <h1>{document.title}</h1>
        <p>{document.description}</p>
        <aside className="legal-notice">
          <strong>Sample only — customize before publishing</strong>
          <p>
            This document contains placeholders and is not legal advice. Replace
            it with a policy reviewed for your business, actual practices, and
            applicable laws.
          </p>
        </aside>
      </header>
      <div className="journal-reading-layout">
        <nav className="journal-toc" aria-label="On this page">
          <span className="journal-eyebrow">Contents</span>
          {document.sections.map((section, i) => (
            <a href={`#section-${i + 1}`} key={section.heading}>
              {section.heading}
            </a>
          ))}
        </nav>
        <div className="journal-prose">
          {document.sections.map((section, i) => (
            <section id={`section-${i + 1}`} key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((text, j) => (
                <p key={j}>{text}</p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
