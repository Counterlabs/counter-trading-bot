import { motion, useScroll } from 'framer-motion';
import { useRef } from 'react';

const phases = [
  {
    phase: '01',
    title: 'INJECTION',
    items: ['Trading Model Development', 'Liquidity Injection', 'Pump.fun Deployment', 'Safety Protocol Deployment'],
    status: 'COMPLETE',
    color: 'text-cyber-primary'
  },
  {
    phase: '02',
    title: 'INFECTION',
    items: ['Viral Spread', 'Cross-Chain Contagion', 'Mobile Command Node', 'Chaos DAO Initialization'],
    status: 'IN_PROGRESS',
    color: 'text-cyber-secondary'
  },
  {
    phase: '03',
    title: 'EXTINCTION',
    items: ['Market Cap Takeover', 'Whale Event', 'Market Analysis System', 'Infinite Profit Loop'],
    status: 'PENDING',
    color: 'text-red-500'
  },
];

const Roadmap = () => {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"]
  });

  return (
    <section id="roadmap" ref={containerRef} className="relative py-32 bg-[#050505] z-10 overflow-hidden">
      {/* Dark overlay for consistency */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/40 pointer-events-none" />

      {/* Background Chaos */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
         <div className="absolute top-0 left-1/4 w-[1px] h-full bg-gradient-to-b from-transparent via-cyber-primary to-transparent"></div>
         <div className="absolute top-0 right-1/4 w-[1px] h-full bg-gradient-to-b from-transparent via-cyber-secondary to-transparent"></div>
      </div>

      <div className="container mx-auto px-4 relative">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="mb-24 border-l-4 border-cyber-primary pl-6 backdrop-blur-sm bg-black/20 py-6 rounded-r-lg"
        >
          <h2 className="font-display font-bold text-5xl md:text-7xl text-white mb-4 glitch-text drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]" data-text="WORLD DOMINATION">
            WORLD DOMINATION
          </h2>
          <p className="text-gray-300 font-mono text-sm tracking-widest uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            // COUNTER DEPLOYMENT PLAN V6.6.6
          </p>
        </motion.div>

        <div className="relative grid grid-cols-1 gap-16 md:gap-0 md:grid-cols-3">
          {/* Connecting Line (Desktop) */}
          <div className="absolute top-12 left-0 w-full h-[2px] bg-white/10 hidden md:block">
             <motion.div
                style={{ scaleX: scrollYProgress, transformOrigin: "left" }}
                className="h-full bg-gradient-to-r from-cyber-primary via-cyber-secondary to-red-500"
             />
          </div>

          {phases.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2, duration: 0.6 }}
              className="relative group md:px-4"
            >
              {/* Node Point */}
              <div className="hidden md:block absolute top-10 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#050505] border-2 border-white group-hover:border-cyber-primary group-hover:scale-125 transition-all z-10 rounded-full shadow-[0_0_10px_rgba(0,243,255,0.5)]">
                 <div className={`w-full h-full rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-current ${item.color}`}></div>
              </div>

              <div className="pt-8 md:pt-20 border-l md:border-l-0 border-white/10 pl-8 md:pl-0 backdrop-blur-sm bg-black/20 p-6 rounded-lg">
                <div className="flex items-baseline gap-4 mb-4">
                    <span className={`font-display font-bold text-5xl opacity-20 group-hover:opacity-50 transition-opacity ${item.color} drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]`}>
                    {item.phase}
                    </span>
                    <span className={`font-mono text-[10px] px-2 py-0.5 border ${item.status === 'IN_PROGRESS' ? 'border-cyber-primary text-cyber-primary animate-pulse backdrop-blur-sm bg-cyber-primary/10' : 'border-white/10 text-gray-400 backdrop-blur-sm bg-black/20'}`}>
                    {item.status}
                    </span>
                </div>

                <h3 className={`font-display font-bold text-2xl text-white mb-6 group-hover:text-cyber-primary transition-colors uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]`}>
                  {item.title}
                </h3>

                <ul className="space-y-3">
                  {item.items.map((subItem, i) => (
                    <li key={i} className="flex items-center text-gray-300 font-mono text-xs md:text-sm group-hover:text-gray-100 transition-colors drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                      <span className={`w-1.5 h-1.5 mr-3 transition-colors ${item.color.replace('text-', 'bg-')}`}></span>
                      {subItem}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Roadmap;
