"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { saveOnboarding } from "@/app/actions/onboarding"
import {
  onboardingInterests,
  useCases,
  type OnboardingAnswers,
} from "@/lib/onboarding"

export function OnboardingForm({
  initial,
  productName,
  aiEnabled,
  next,
}: {
  initial: OnboardingAnswers
  productName: string
  aiEnabled: boolean
  next: string
}) {
  const [answers, setAnswers] = useState(initial)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const heading = useRef<HTMLHeadingElement>(null)
  const step = answers.current_step
  useEffect(() => {
    heading.current?.focus()
  }, [step])
  const title =
    step === 1
      ? "What should we call you?"
      : step === 2
        ? `What will you use ${productName} for?`
        : "What would you like to try first?"

  function save(
    current_step: number,
    status: OnboardingAnswers["status"] = "in_progress"
  ) {
    setError("")
    startTransition(async () => {
      try {
        const result = await saveOnboarding(
          { ...answers, current_step, status },
          next
        )
        if (result?.error) setError(result.error)
        else if (status === "in_progress")
          setAnswers((value) => ({ ...value, current_step }))
      } catch {
        setError(
          "Your answers weren’t saved. Check your connection and try again."
        )
      }
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        save(Math.min(step + 1, 3), step === 3 ? "completed" : "in_progress")
      }}
    >
      <div className="mb-10">
        <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
          Step {step} of 3
        </p>
        <div className="flex gap-2" aria-hidden="true">
          {[1, 2, 3].map((item) => (
            <span
              key={item}
              className={`h-1 flex-1 rounded-full ${item <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
      </div>
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-3xl font-semibold tracking-tight outline-none sm:text-4xl"
      >
        {title}
      </h1>
      <p
        id="onboarding-help"
        className="mt-3 text-sm leading-6 text-muted-foreground"
      >
        {step === 1
          ? "Let’s make this space feel a little more like you."
          : step === 2
            ? "Choose the one that fits best."
            : "Pick anything that interests you. You can explore it all later."}
      </p>
      <fieldset
        disabled={pending}
        className="mt-8 space-y-3"
        aria-labelledby={step === 1 ? undefined : "onboarding-question"}
      >
        <legend id="onboarding-question" className="sr-only">
          {title}
        </legend>
        {step === 1 ? (
          <div className="space-y-2">
            <label htmlFor="onboarding-name" className="text-sm font-medium">
              Your name
            </label>
            <Input
              id="onboarding-name"
              autoComplete="given-name"
              maxLength={80}
              value={answers.display_name}
              aria-describedby="onboarding-help"
              placeholder="e.g. Lucas"
              onChange={(event) =>
                setAnswers({ ...answers, display_name: event.target.value })
              }
              className="h-12"
            />
          </div>
        ) : (
          (step === 2
            ? useCases
            : onboardingInterests.filter(
                (item) => aiEnabled || item.value !== "ai"
              )
          ).map((item) => {
            const selected =
              step === 2
                ? answers.use_case === item.value
                : answers.interests.includes(
                    item.value as OnboardingAnswers["interests"][number]
                  )
            return (
              <label
                key={item.value}
                className={`relative flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm transition-colors hover:bg-muted/50 has-focus-visible:ring-2 has-focus-visible:ring-ring ${selected ? "border-primary bg-muted/60" : "border-border"}`}
              >
                <input
                  className="peer sr-only"
                  type={step === 2 ? "radio" : "checkbox"}
                  name={step === 2 ? "use_case" : "interests"}
                  value={item.value}
                  checked={selected}
                  onChange={() => {
                    if (step === 2)
                      setAnswers({
                        ...answers,
                        use_case: item.value as OnboardingAnswers["use_case"],
                      })
                    else {
                      const value =
                        item.value as OnboardingAnswers["interests"][number]
                      setAnswers({
                        ...answers,
                        interests: selected
                          ? answers.interests.filter((entry) => entry !== value)
                          : [...answers.interests, value],
                      })
                    }
                  }}
                />
                <span
                  aria-hidden="true"
                  className={`flex size-5 shrink-0 items-center justify-center border ${step === 2 ? "rounded-full" : "rounded-md"} ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
                >
                  {selected && <Check className="size-3.5" />}
                </span>
                {item.label}
              </label>
            )
          })
        )}
      </fieldset>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-10 flex items-center justify-between gap-4">
        <Button
          type="button"
          variant="ghost"
          disabled={pending || step === 1}
          onClick={() => save(step - 1)}
        >
          <ArrowLeft /> Back
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : step === 3 ? "Get started" : "Continue"}
          <ArrowRight />
        </Button>
      </div>
      <div className="mt-5 text-center">
        <Button
          type="button"
          variant="link"
          className="text-muted-foreground"
          disabled={pending}
          onClick={() => save(step, "skipped")}
        >
          Skip for now
        </Button>
      </div>
    </form>
  )
}
