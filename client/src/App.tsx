import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Scene from './components/canvas/Scene';
import Navbar from './components/ui/Navbar';
import Hero from './components/ui/Hero';
import Features from './components/ui/Features';
import Roadmap from './components/ui/Roadmap';
import Footer from './components/ui/Footer';
import Terminal from './components/ui/Terminal';
import Analytics from './components/ui/Analytics';
import TradingTerminal from './pages/trading-terminal';
import { SolanaProvider } from './lib/solana/wallet-context';
import { AuthProvider } from './lib/auth-context';
import { useEffect } from 'react';

const DISPLAY_WALLET = 'F49kEd3Lpr21EdCMJRU5bhEaNiSxTnLqsLhD9MYfdhHQ';

function DataPreloader() {
  useEffect(() => {
    const preloadData = async () => {
      try {
        await Promise.all([
          fetch(`/api/wallet/${DISPLAY_WALLET}/balance`),
          fetch(`/api/positions/${encodeURIComponent(DISPLAY_WALLET)}`),
          fetch('/api/tokens'),
          fetch('/api/stats'),
        ]);
        console.log('[Preloader] Data preloaded for trading terminal');
      } catch (error) {
        console.error('[Preloader] Failed to preload data:', error);
      }
    };
    preloadData();
  }, []);
  
  return null;
}

function LandingPage() {
  return (
    <div className="bg-[#030303] text-white min-h-screen selection:bg-cyber-primary selection:text-black">
      <Navbar />

      <main>
        {/* Hero Section with 3D Background */}
        <div className="relative h-screen w-full">
          <Scene />
          <Hero />
        </div>

        {/* Content Sections */}
        <Terminal />
        <Analytics />
        <Features />
        <Roadmap />
      </main>

      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SolanaProvider>
          <DataPreloader />
          <Switch>
            <Route path="/" component={LandingPage} />
            <Route path="/app" component={TradingTerminal} />
          </Switch>
          <Toaster />
        </SolanaProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
