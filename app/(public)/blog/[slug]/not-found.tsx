import Link from "next/link"
export default function StoryNotFound() {
  return (
    <div className="marketing-container journal-empty">
      <h1>Story not found.</h1>
      <p>This story may have moved or is no longer published.</p>
      <Link href="/blog" className="journal-back">
        Back to all stories
      </Link>
    </div>
  )
}
