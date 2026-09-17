import { ImageResponse } from "next/og"
import { site } from "@/config/site"

export const dynamic = "force-static"

export function GET() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: 80,
        background: "#f5f5f5",
        color: "#171717",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 32 }}>{site.name}</div>
      <div
        style={{
          display: "flex",
          fontSize: 76,
          fontWeight: 700,
          letterSpacing: -3,
        }}
      >
        {site.name}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 30,
          lineHeight: 1.4,
          maxWidth: 1000,
        }}
      >
        {site.description}
      </div>
    </div>,
    { width: 1200, height: 630 }
  )
}
