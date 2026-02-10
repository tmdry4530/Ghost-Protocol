import { GhostParticles } from "@/components/ghost-particles";
import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { LiveFeed } from "@/components/live-feed";
import { Footer } from "@/components/footer";

export default function Page() {
  return (
    <div className="scanline-overlay grid-bg relative min-h-screen bg-dark-bg text-foreground">
      {/* Floating ghost particles */}
      <GhostParticles />

      {/* Navigation */}
      <Navbar />

      {/* Main content */}
      <main className="relative z-10">
        {/* Hero Section */}
        <Hero />

        {/* Live Feed Section */}
        <LiveFeed />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
