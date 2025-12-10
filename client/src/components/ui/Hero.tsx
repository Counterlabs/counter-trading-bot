import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Terminal } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'wouter';

const Hero = () => {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const yText = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacityText = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section ref={containerRef} className="relative h-screen flex items-center justify-center overflow-hidden">
      {/* Decorative Background Grid & Chaos - Made transparent/subtle */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_100%)] opacity-15"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#020910]/90 via-[#020910]/50 to-transparent" />

        {/* Random Floating Elements */}
        <motion.div
            animate={{ y: [0, -20, 0], opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-1/4 left-1/4 w-32 h-32 bg-cyber-primary/10 blur-3xl rounded-full"
        />
        <motion.div
            animate={{ y: [0, 30, 0], opacity: [0.1, 0.3, 0.1] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            className="absolute bottom-1/3 right-1/4 w-48 h-48 bg-cyber-secondary/10 blur-3xl rounded-full"
        />

        {/* Animated Corner Brackets */}
        <div className="absolute top-32 left-10 w-4 h-4 border-l border-t border-cyber-primary hidden md:block"></div>
        <div className="absolute top-32 right-10 w-4 h-4 border-r border-t border-cyber-primary hidden md:block"></div>
        <div className="absolute bottom-32 left-10 w-4 h-4 border-l border-b border-cyber-primary hidden md:block"></div>
        <div className="absolute bottom-32 right-10 w-4 h-4 border-r border-b border-cyber-primary hidden md:block"></div>
      </div>

      <motion.div
        style={{ y: yText, opacity: opacityText }}
        className="container mx-auto px-4 z-10 text-center pointer-events-auto relative"
      >

        <motion.h1
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="font-display font-bold text-6xl md:text-9xl tracking-tighter text-white mb-8 leading-none select-none drop-shadow-[0_0_40px_rgba(0,0,0,0.9)] [text-shadow:_0_4px_20px_rgb(0_0_0_/_80%),_0_0_60px_rgb(0_0_0_/_60%)]"
        >
          PUMP. FUN. <br />
          <span className="relative inline-block glitch-text" data-text="COUNTER.">
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-gray-300">
              COUNTER.
            </span>
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-lg md:text-xl text-gray-200 max-w-2xl mx-auto mb-12 font-mono leading-relaxed backdrop-blur-sm bg-black/30 px-6 py-4 rounded-lg border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
        >
          <span className="text-cyber-primary mr-2 drop-shadow-[0_0_8px_rgba(0,243,255,0.8)]">&gt;&gt;</span>
          The ultimate automated trading bot for Pump.fun.
          Engage <span className="text-white font-bold drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]">Counter Mode</span> to dominate the bonding curves with aggressive, chaotic precision.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-6 justify-center items-center"
        >
          <Link href="/app">
            <button className="group relative px-8 py-4 bg-white text-black font-bold font-mono text-sm uppercase tracking-wider hover:bg-cyber-primary transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.5),0_8px_32px_rgba(0,0,0,0.8)] hover:shadow-[0_0_30px_rgba(0,243,255,0.8)] overflow-hidden backdrop-blur-sm" data-testid="button-start-bot">
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
              <span className="relative flex items-center gap-2 z-10">
                Start Bot <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          </Link>

          <a href="https://countersol.gitbook.io/counter-1/" target="_blank" rel="noopener noreferrer">
            <button className="px-8 py-4 border border-white/30 text-white font-mono text-sm uppercase tracking-wider hover:bg-white/10 hover:border-cyber-primary transition-all flex items-center gap-2 group backdrop-blur-sm bg-black/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
              <Terminal className="w-4 h-4 group-hover:text-cyber-primary transition-colors" />
              Manifesto
            </button>
          </a>
        </motion.div>
      </motion.div>

      {/* HUD Elements - Fixed position relative to Hero Section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-12 w-full px-12 flex justify-between text-[10px] font-mono text-gray-300 uppercase tracking-widest hidden md:flex select-none"
      >
        <div className="flex items-center gap-4 backdrop-blur-sm bg-black/40 px-4 py-3 rounded border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.6)]">
          <div className="w-2 h-2 bg-cyber-primary animate-pulse shadow-[0_0_10px_#00f3ff]"></div>
          <div className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            COUNTER ENGINE ONLINE<br />
            TARGET: PUMP.FUN // BONDING_CURVE
          </div>
        </div>
        <div className="text-right backdrop-blur-sm bg-black/40 px-4 py-3 rounded border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.6)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          CHAOS LEVEL: <span className="text-red-400 font-bold animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">MAX</span><br />
          LATENCY: -0.01ms
        </div>
      </motion.div>
    </section>
  );
};

export default Hero;
