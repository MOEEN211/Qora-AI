"use client"
import { useActionState, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Upload, LoaderCircle } from "lucide-react"
import { updateProfile } from "@/app/actions/settings"
import { saveAvatar } from "@/app/actions/account"
import type { ActionState } from "@/lib/form-state"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Feedback, Section, type SettingsProps } from "./shared"

export function General({
  name,
  email,
  avatarUrl,
}: Pick<SettingsProps, "name" | "email" | "avatarUrl">) {
  const router = useRouter()
  const [fullName, setFullName] = useState(name)
  const [savedName, setSavedName] = useState(name)
  const [profileState, save, saving] = useActionState(
    async (state: ActionState, form: FormData) => {
      try {
        const result = await updateProfile(state, form)
        if (result.success) {
          setSavedName(String(form.get("full_name")).trim())
          router.refresh()
        }
        return result
      } catch {
        return { error: "Your profile couldn't be saved. Try again." }
      }
    },
    {}
  )
  const [photoState, setPhotoState] = useState<ActionState>({})
  const [uploading, upload] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)
  function photo(form: FormData) {
    upload(async () => {
      setPhotoState({})
      try {
        const result = await saveAvatar(form)
        setPhotoState(result)
        if (result.success) router.refresh()
      } catch {
        setPhotoState({
          error: "Photo couldn't be saved. Try a smaller image.",
        })
      }
      if (fileInput.current) fileInput.current.value = ""
    })
  }
  return (
    <Card className="gap-0 py-0">
      <Section
        title="Profile photo"
        description="A familiar face for your account. Make it yours."
      >
        <div className="flex flex-wrap items-center gap-5">
          <Avatar className="size-20">
            <AvatarImage
              src={avatarUrl || undefined}
              alt="Your profile photo"
            />
            <AvatarFallback className="text-xl">
              {name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((n) => n[0])
                .join("")}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Upload />
                )}
                Upload photo
              </Button>
              {avatarUrl && (
                <Button
                  variant="ghost"
                  disabled={uploading}
                  onClick={() => {
                    const form = new FormData()
                    form.set("remove", "true")
                    photo(form)
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              JPG, PNG or WebP. Up to 2 MB.
            </p>
          </div>
          <Input
            ref={fileInput}
            aria-label="Profile photo file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              if (file.size > 2 * 1024 * 1024) {
                setPhotoState({ error: "Choose an image smaller than 2 MB." })
                event.target.value = ""
                return
              }
              const form = new FormData()
              form.set("photo", file)
              photo(form)
            }}
          />
        </div>
        <div className="mt-4">
          <Feedback state={photoState} />
        </div>
      </Section>
      <Separator />
      <form action={save}>
        <Section
          title="Personal details"
          description="Your name appears throughout your workspace."
        >
          <div className="max-w-lg space-y-6">
            <Field>
              <FieldLabel htmlFor="full_name">Full name</FieldLabel>
              <Input
                className="h-11"
                id="full_name"
                name="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                minLength={2}
                maxLength={80}
                autoComplete="name"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">
                Email address
                <Badge
                  variant="secondary"
                  className="ml-auto text-[10px] font-normal"
                >
                  Sign-in email
                </Badge>
              </FieldLabel>
              <Input
                className="h-11 bg-muted/30 text-muted-foreground"
                id="email"
                value={email}
                readOnly
              />
              <FieldDescription>
                Your sign-in email is managed separately from your profile.
              </FieldDescription>
            </Field>
            <Feedback state={profileState} />
          </div>
        </Section>
        <div className="flex items-center justify-between gap-4 border-t bg-muted/20 px-6 py-4 md:px-8">
          <p className="text-xs text-muted-foreground">
            {fullName.trim() === savedName
              ? "Your profile is up to date."
              : "You have unsaved changes."}
          </p>
          <Button
            type="submit"
            disabled={saving || fullName.trim() === savedName}
          >
            {saving && <LoaderCircle className="animate-spin" />}Save changes
          </Button>
        </div>
      </form>
    </Card>
  )
}
