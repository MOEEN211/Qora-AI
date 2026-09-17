import { ChevronDown, Plus } from "lucide-react"
import { site } from "@/config/site"

export function FaqList({
  items,
}: {
  items: readonly { question: string; answer: string }[]
}) {
  return (
    <div className="faq-list">
      {items.map((faq) => (
        <details key={faq.question}>
          <summary>
            {faq.question.replaceAll("Forma", site.name)}
            <Plus size={17} className="faq-plus" aria-hidden="true" />
            <ChevronDown size={17} className="faq-minus" aria-hidden="true" />
          </summary>
          <p>{faq.answer.replaceAll("Forma", site.name)}</p>
        </details>
      ))}
    </div>
  )
}
