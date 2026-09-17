"use client"
import Link from "next/link"
import { Button } from "@/components/ui/button"
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="space-y-4 p-6"><h1 className="text-xl font-semibold">Admin data is unavailable</h1><p className="text-sm text-muted-foreground">Your access may have changed, or the service is temporarily unavailable.</p><div className="flex gap-3"><Button onClick={reset}>Try again</Button><Link href="/admin" className="text-sm underline">Check access</Link><Link href="/dashboard" className="text-sm underline">Back to app</Link></div></div> }
