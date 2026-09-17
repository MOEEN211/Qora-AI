"use client"

import { useActionState, useState } from "react"
import { ArrowUpRight, Check, Loader2 } from "lucide-react"
import { sendContact } from "@/app/actions/contact"
import type { ActionState } from "@/lib/form-state"

export function ContactForm({ ready }: { ready: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    sendContact,
    {}
  )
  const [message, setMessage] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [topic, setTopic] = useState("")
  if (state.success)
    return (
      <div className="contact-form contact-success" role="status">
        <span>
          <Check size={25} />
        </span>
        <h2>Message sent.</h2>
        <p>{state.success}</p>
        <a href="/contact" className="marketing-button marketing-button-light">
          Write another message <ArrowUpRight size={15} />
        </a>
      </div>
    )
  return (
    <form
      action={action}
      className="contact-form"
      aria-labelledby="contact-form-title"
    >
      <div className="contact-form-heading">
        <h2 id="contact-form-title">Send us a message</h2>
        <p>All fields are required.</p>
      </div>
      <fieldset disabled={pending} className="contact-fields">
        <div className="contact-field-row">
          <div className="contact-field">
            <label htmlFor="contact-name">Your name</label>
            <input
              id="contact-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              placeholder="Alex Morgan"
              required
              minLength={2}
              maxLength={100}
            />
          </div>
          <div className="contact-field">
            <label htmlFor="contact-email">Email address</label>
            <input
              id="contact-email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              placeholder="alex@company.com"
              required
              maxLength={254}
            />
          </div>
        </div>
        <div className="contact-field">
          <label htmlFor="contact-topic">What’s it about?</label>
          <select
            id="contact-topic"
            name="topic"
            required
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          >
            <option value="" disabled>
              Select a topic
            </option>
            <option>General question</option>
            <option>Getting started</option>
            <option>Plans &amp; billing</option>
            <option>Something else</option>
          </select>
        </div>
        <div className="contact-field">
          <label htmlFor="contact-message">Your message</label>
          <textarea
            id="contact-message"
            name="message"
            placeholder="Tell us a little about your project and how we can help…"
            rows={6}
            required
            minLength={20}
            maxLength={5000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-describedby="message-hint"
          />
          <div className="contact-message-hint" id="message-hint">
            <span>A little context goes a long way.</span>
            <span>{message.length.toLocaleString("en-US")} / 5,000</span>
          </div>
        </div>
        <div hidden aria-hidden="true">
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        {state.error && (
          <p role="alert" className="contact-error">
            {state.error}
          </p>
        )}
        {!ready && (
          <p className="contact-availability" role="status">
            Our contact form is being connected. Please check back soon. In the
            meantime, explore the FAQs or documentation.
          </p>
        )}
        <button
          type="submit"
          disabled={!ready || pending}
          className="marketing-button marketing-button-dark contact-submit"
        >
          {pending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Sending message…
            </>
          ) : (
            <>
              Send message <ArrowUpRight size={16} />
            </>
          )}
        </button>
        <p className="contact-privacy">
          We’ll use your details to respond to this message. Please don’t
          include passwords or other sensitive information.
        </p>
      </fieldset>
    </form>
  )
}
