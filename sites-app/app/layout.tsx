import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  const socialImage = `${protocol}://${host}/og.png`;

  return {
    title: "Organizador de Partidos ASP",
    description:
      "Demo interactiva para organizar disponibilidad, equipos y pagos.",
    openGraph: {
      title: "Organizador de Partidos ASP",
      description:
        "Demo interactiva para organizar disponibilidad, equipos y pagos.",
      type: "website",
      locale: "es_AR",
      images: [{ url: socialImage, width: 1730, height: 909 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Organizador de Partidos ASP",
      description:
        "Demo interactiva para organizar disponibilidad, equipos y pagos.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
