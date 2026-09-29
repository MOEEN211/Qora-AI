"use client"

import { useState } from "react"
import { Sparkles, RefreshCw, Copy, Check, Lightbulb } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const SPARKS = [
  {
    category: "AI Strategy",
    quote: "Focus on automating the most repetitive 20% of your user workflow first — that delivers 80% of immediate perceived value.",
  },
  {
    category: "Growth & Retention",
    quote: "Send personalized onboarding emails within 15 minutes of signup while the user's intent is at its absolute peak.",
  },
  {
    category: "Product Velocity",
    quote: "Ship weekly micro-improvements. Consistent small iterations compound faster than waiting for monolithic releases.",
  },
  {
    category: "Pricing & Value",
    quote: "Anchor your premium tier to business ROI (hours saved or revenue unlocked) rather than arbitrary usage limits.",
  },
  {
    category: "Customer Delight",
    quote: "Surprise users with frictionless keyboard shortcuts and instant response times for frequent actions.",
  },
  {
    category: "AI Prompt Idea",
    quote: "Prompt your assistant: 'Analyze our top 3 customer friction points and suggest 2 zero-friction UI micro-interactions.'",
  },
]

export function QuickSpark() {
  const [index, setIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  const [isRotating, setIsRotating] = useState(false)

  const current = SPARKS[index]

  const handleNext = () => {
    setIsRotating(true)
    setTimeout(() => {
      setIndex((prev) => (prev + 1) % SPARKS.length)
      setIsRotating(false)
    }, 200)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(`"${current.quote}" — Qora.ai Daily Spark`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <Card className="relative overflow-hidden border border-border/80 bg-gradient-to-br from-card via-card to-muted/30 shadow-sm transition-all hover:shadow-md">
      <div className="absolute top-0 right-0 -mt-10 -mr-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400">
            <Sparkles className="size-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold tracking-tight">Qora.ai Daily Spark</CardTitle>
            <CardDescription className="text-xs">Random AI & product insights to kickstart your day</CardDescription>
          </div>
        </div>
        <Badge variant="outline" className="text-xs font-normal border-indigo-500/30 text-indigo-500 dark:text-indigo-400">
          <Lightbulb className="mr-1 size-3" />
          {current.category}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="min-h-[64px] rounded-xl border border-border/60 bg-background/60 p-4 backdrop-blur-sm transition-all">
          <p className="text-sm font-medium leading-relaxed text-foreground">
            &ldquo;{current.quote}&rdquo;
          </p>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            Idea {index + 1} of {SPARKS.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              className="h-8 gap-1.5 px-3 text-xs"
            >
              <RefreshCw className={`size-3.5 ${isRotating ? "animate-spin" : ""}`} />
              Next Spark
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
