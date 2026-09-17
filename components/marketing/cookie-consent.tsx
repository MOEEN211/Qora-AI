"use client"

import { useEffect, useRef, useState } from "react"
import { Cookie } from "lucide-react"

const STORAGE_KEY = "forma:cookie-consent-demo:v1"
type Choice = "accepted" | "declined"

function isChoice(value: string | null): value is Choice {
  return value === "accepted" || value === "declined"
}

export function CookieConsent() {
  const [phase, setPhase] = useState<"hidden" | "visible" | "leaving">("hidden")
  const entranceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const preferencesButton = useRef<HTMLButtonElement>(null)
  const openedFromFooter = useRef(false)
  const acceptButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Read only after hydration, so saved choices never flash on the server render.
    entranceTimer.current = setTimeout(() => {
      try {
        if (isChoice(localStorage.getItem(STORAGE_KEY))) return
      } catch {
        // A browser that blocks storage can still use and dismiss the demo.
      }
      setPhase("visible")
    }, 700)

    function syncChoice(event: StorageEvent) {
      if (event.key !== STORAGE_KEY && event.key !== null) return
      if (entranceTimer.current) clearTimeout(entranceTimer.current)
      setPhase(isChoice(event.newValue) ? "leaving" : "visible")
    }
    window.addEventListener("storage", syncChoice)
    return () => {
      if (entranceTimer.current) clearTimeout(entranceTimer.current)
      window.removeEventListener("storage", syncChoice)
    }
  }, [])

  useEffect(() => {
    if (phase === "visible" && openedFromFooter.current) {
      acceptButton.current?.focus({ preventScroll: true })
    }
    if (phase !== "leaving") return
    const timer = setTimeout(() => setPhase("hidden"), 240)
    return () => clearTimeout(timer)
  }, [phase])

  function choose(choice: Choice) {
    if (phase !== "visible") return
    try {
      localStorage.setItem(STORAGE_KEY, choice)
    } catch {
      // Dismiss for this visit even when persistence is unavailable.
    }
    setPhase("leaving")
    if (openedFromFooter.current) {
      preferencesButton.current?.focus({ preventScroll: true })
      openedFromFooter.current = false
    }
  }

  return (
    <>
      <button
        ref={preferencesButton}
        type="button"
        className="cookie-preferences-link"
        aria-controls={phase !== "hidden" ? "cookie-consent" : undefined}
        aria-expanded={phase === "visible"}
        onClick={() => {
          if (entranceTimer.current) clearTimeout(entranceTimer.current)
          openedFromFooter.current = true
          setPhase("visible")
          acceptButton.current?.focus({ preventScroll: true })
        }}
      >
        Cookie preferences
      </button>
      {phase !== "hidden" && (
        <aside
          id="cookie-consent"
          className="cookie-consent"
          data-state={phase}
          aria-labelledby="cookie-consent-title"
          aria-describedby="cookie-consent-description"
          inert={phase === "leaving"}
        >
          <div className="cookie-consent-heading">
            <span className="cookie-consent-icon" aria-hidden="true">
              <Cookie size={25} strokeWidth={1.5} />
            </span>
            <span className="cookie-consent-demo">Template demo</span>
          </div>
          <h2 id="cookie-consent-title">A little note about cookies.</h2>
          <p id="cookie-consent-description">
            This is a cookie consent demo. It doesn’t set tracking cookies or
            collect browsing data. We’ll only remember your choice in this browser.
          </p>
          <div className="cookie-consent-actions">
            <button type="button" onClick={() => choose("declined")}>
              Decline
            </button>
            <button
              ref={acceptButton}
              type="button"
              className="cookie-consent-accept"
              onClick={() => choose("accepted")}
            >
              Accept cookies
            </button>
          </div>
          <p className="cookie-consent-footnote">
            Just a demo. Your choice won’t enable any tracking.
          </p>
        </aside>
      )}
    </>
  )
}
