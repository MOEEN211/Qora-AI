import { docs } from "@/.source/server"
import { loader } from "fumadocs-core/source"
import { createElement } from "react"
import { BookOpen, Braces, Cable, Layers, Rocket, Wrench } from "lucide-react"

const icons = { BookOpen, Braces, Cable, Layers, Rocket, Wrench }

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  icon(name) {
    if (name && name in icons)
      return createElement(icons[name as keyof typeof icons])
  },
})
