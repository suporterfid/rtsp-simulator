import { useHashLocation } from "wouter/use-hash-location";
import { Route, Router, Link, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Dashboard from "@/pages/Dashboard";
import CameraConfig from "@/pages/CameraConfig";
import NotFound from "@/pages/not-found";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { useState, useEffect } from "react";
import { Video, Settings, Activity, MonitorPlay } from "lucide-react";

function Nav() {
  const [loc] = useLocation();
  const links = [
    { href: "/", label: "Câmeras", icon: <MonitorPlay size={16} /> },
    { href: "/config", label: "Configurar", icon: <Settings size={16} /> },
    { href: "/stats", label: "Estatísticas", icon: <Activity size={16} /> },
  ];
  return (
    <nav className="flex items-center gap-1">
      {links.map(l => (
        <Link key={l.href} href={l.href}>
          <a className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors
            ${loc === l.href
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}>
            {l.icon}{l.label}
          </a>
        </Link>
      ))}
    </nav>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo SVG */}
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="RTSP Simulator" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="6" fill="hsl(142,70%,45%)" fillOpacity="0.15"/>
              <circle cx="16" cy="16" r="10" stroke="hsl(142,70%,45%)" strokeWidth="2"/>
              <circle cx="16" cy="16" r="5" fill="hsl(142,70%,45%)" fillOpacity="0.8"/>
              <circle cx="16" cy="16" r="2" fill="hsl(142,70%,45%)"/>
              <line x1="16" y1="6" x2="16" y2="8" stroke="hsl(142,70%,45%)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="16" y1="24" x2="16" y2="26" stroke="hsl(142,70%,45%)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="6" y1="16" x2="8" y2="16" stroke="hsl(142,70%,45%)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="24" y1="16" x2="26" y2="16" stroke="hsl(142,70%,45%)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <div className="font-bold text-sm leading-tight text-foreground">RTSP Simulator</div>
              <div className="text-xs text-muted-foreground mono leading-tight">NVR/VMS Test Platform</div>
            </div>
          </div>
          <Nav />
        </div>
      </header>
      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-border py-3 px-4 text-xs text-muted-foreground text-center">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}

export default function App() {
  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Layout>
          <Route path="/" component={Dashboard} />
          <Route path="/config" component={CameraConfig} />
          <Route path="/stats" component={() => <Dashboard statsOnly />} />
          <Route component={NotFound} />
        </Layout>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
