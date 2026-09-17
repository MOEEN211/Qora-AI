import Image from "next/image"

// Fictional examples for the starter. Replace quotes, identities, and portraits
// together with approved customer material before presenting these as reviews.
const testimonials = [
  {
    name: "Sophie Miller",
    role: "Solo founder",
    portrait: "/marketing/portraits/builder-01.webp",
    headline: "My product finally gets my attention.",
    quote:
      "I wanted to build my idea, not another login flow. Having authentication, workspaces, and billing in one place means I can spend my time on the features my customers actually need.",
  },
  {
    name: "Daniel Brooks",
    role: "AI-assisted builder",
    portrait: "/marketing/portraits/builder-02.webp",
    headline: "A starting point my AI agent can build on.",
    quote:
      "Starting with a blank repo meant asking my AI assistant to wire everything together. With Forma, I can work from an existing foundation and focus our prompts on making the product my own.",
  },
  {
    name: "Alex Morgan",
    role: "Product developer",
    portrait: "/marketing/portraits/builder-03.webp",
    headline: "It feels like my app from the start.",
    quote:
      "I can change the branding, reshape the UI, and extend the Next.js source directly. My services stay in my own accounts, so I have a clear path from the starter to the SaaS I want to build.",
  },
]

export function Testimonials() {
  return (
    <section
      id="testimonials"
      className="marketing-testimonials marketing-section marketing-container"
      aria-labelledby="testimonials-title"
      aria-describedby="testimonials-note"
    >
      <div className="section-heading">
        <span className="marketing-eyebrow">THE BUILDER PERSPECTIVE</span>
        <h2 id="testimonials-title">
          Less boilerplate.
          <br />
          <span>More of your own product.</span>
        </h2>
        <p id="testimonials-note" className="testimonials-note">
          Illustrative testimonials with fictional names and stock portraits.
          Replace with your customers’ stories before launch.
        </p>
      </div>
      <div className="testimonial-grid">
        {testimonials.map((testimonial) => (
          <figure className="testimonial-card" key={testimonial.name}>
            <span className="testimonial-quote-mark" aria-hidden="true">
              “
            </span>
            <blockquote>
              <p className="testimonial-headline">{testimonial.headline}</p>
              <p className="testimonial-body">{testimonial.quote}</p>
            </blockquote>
            <figcaption className="testimonial-person">
              <Image
                src={testimonial.portrait}
                alt=""
                width={52}
                height={52}
                sizes="52px"
              />
              <div>
                <p>{testimonial.name}</p>
                <span>{testimonial.role} · Example</span>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
