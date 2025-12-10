import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Terminal as TerminalIcon, Maximize2, Minus, X, Activity } from 'lucide-react';

const logs = [
  { type: 'info', text: 'Initializing Counter Module...' },
  { type: 'info', text: 'Connecting to Pump.fun RPC node...' },
  { type: 'success', text: 'Connection established. Latency: 1ms' },
  { type: 'info', text: 'Scanning new bonding curves...' },
  { type: 'warning', text: 'Scanning mempool for degens...' },
  { type: 'success', text: 'Target identified: $CHAD-SOL Bonding Curve' },
  { type: 'danger', text: '>> SNIPE EXECUTED: Bought 5% supply' },
  { type: 'info', text: 'Calculating dump trajectory...' },
  { type: 'success', text: 'Opportunity found: Dev wallet selling' },
  { type: 'info', text: 'Executing front-run sell...' },
  { type: 'success', text: 'Transaction confirmed. Profit: 150 SOL' },
  { type: 'info', text: 'Resuming chaos...' },
];

const Terminal = () => {
  const [lines, setLines] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < logs.length) {
        setLines(prev => [...prev, { ...logs[currentIndex], id: Date.now() }]);
        currentIndex++;
        // Auto scroll
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      } else {
        // Reset for loop effect
        setLines([]);
        currentIndex = 0;
      }
    }, 800); // New line every 800ms

    return () => clearInterval(interval);
  }, []);

  return (
    <section id="terminal" className="relative py-24 z-10 overflow-hidden">
      {/* Dark overlay for consistency */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/40 pointer-events-none" />

      <div className="container mx-auto px-4 flex flex-col lg:flex-row items-center gap-16 relative">

        {/* Text Side */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="lg:w-1/2"
        >
          <div className="flex items-center gap-3 mb-6 text-cyber-primary">
            <Activity className="w-6 h-6 animate-pulse drop-shadow-[0_0_8px_rgba(0,243,255,0.8)]" />
            <span className="font-mono text-sm tracking-widest uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">Live Chaos Feed</span>
          </div>
          <h2 className="font-display font-bold text-4xl md:text-5xl text-white mb-6 drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
            LIVE CHAOS <br/>
            <span className="text-gray-300">FEED</span>
          </h2>
          <p className="text-gray-200 font-mono leading-relaxed mb-8 backdrop-blur-sm bg-black/30 px-6 py-4 rounded-lg border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
            Watch the Counter bot decimate the bonding curves in real-time.
            Unfiltered transaction dominance before they hit the public charts.
          </p>
          <button className="px-6 py-3 border border-cyber-primary/50 text-cyber-primary hover:bg-cyber-primary hover:text-black font-mono text-sm uppercase transition-all backdrop-blur-sm bg-black/20 hover:border-cyber-primary shadow-[0_4px_16px_rgba(0,0,0,0.6)] hover:shadow-[0_0_20px_rgba(0,243,255,0.6)]">
            Access Full Console
          </button>
        </motion.div>

        {/* Terminal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="lg:w-1/2 w-full"
        >
          <div className="w-full bg-black/60 backdrop-blur-md border border-white/20 rounded-lg overflow-hidden shadow-[0_0_50px_rgba(0,243,255,0.15),0_8px_32px_rgba(0,0,0,0.8)] font-mono text-sm relative group">

            {/* Window Header */}
            <div className="bg-black/80 backdrop-blur-sm px-4 py-2 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-500">
                <TerminalIcon className="w-4 h-4" />
                <span className="text-xs">COUNTER_MOD_CLI — v6.6.6 — bash</span>
              </div>
              <div className="flex items-center gap-2">
                <Minus className="w-3 h-3 text-gray-500 hover:text-white cursor-pointer" />
                <Maximize2 className="w-3 h-3 text-gray-500 hover:text-white cursor-pointer" />
                <X className="w-3 h-3 text-gray-500 hover:text-red-500 cursor-pointer" />
              </div>
            </div>

            {/* Window Content */}
            <div
                ref={scrollRef}
                className="h-[400px] p-6 overflow-y-auto font-mono text-xs md:text-sm space-y-2 no-scrollbar"
            >
              <div className="text-gray-500 mb-4">Last login: {new Date().toUTCString()} on ttys000</div>

              {lines.map((line, i) => (
                <motion.div
                    key={line.id + i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex gap-3"
                >
                    <span className="text-gray-600">[{new Date().toLocaleTimeString()}]</span>
                    <span className={`${
                        line.type === 'success' ? 'text-green-400' :
                        line.type === 'danger' ? 'text-red-400 font-bold' :
                        line.type === 'warning' ? 'text-yellow-400' : 'text-cyber-primary'
                    }`}>
                        {line.type === 'danger' && '⚠ '}{line.text}
                    </span>
                </motion.div>
              ))}
              <div className="animate-pulse text-cyber-primary">_</div>
            </div>

            {/* Scanline Overlay */}
            <div className="absolute inset-0 pointer-events-none bg-scan-line opacity-5"></div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Terminal;
