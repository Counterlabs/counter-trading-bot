import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { PieChart, TrendingUp, DollarSign, Activity } from 'lucide-react';

const stats = [
  { label: 'Total SOL Volume', value: '1.2K', icon: Activity, color: 'text-cyber-primary' },
  { label: 'Rugs Dodged', value: '14,203', icon: TrendingUp, color: 'text-green-400' },
  { label: 'Profit Extracted', value: '$900', icon: DollarSign, color: 'text-cyber-secondary' },
  { label: 'Active Trading Models', value: '17', icon: PieChart, color: 'text-purple-400' },
];

const Analytics = () => {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  const y1 = useTransform(scrollYProgress, [0, 1], [100, -100]);
  const y2 = useTransform(scrollYProgress, [0, 1], [50, -50]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);

  return (
    <section id="analytics" ref={containerRef} className="relative py-32 bg-[#030303] overflow-hidden z-10">
      {/* Dark overlay for consistency */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/50 pointer-events-none" />

      {/* Background Parallax Elements */}
      <motion.div style={{ y: y1 }} className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyber-primary/5 rounded-full blur-[100px] pointer-events-none" />
      <motion.div style={{ y: y2 }} className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-cyber-secondary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 relative">
        <motion.div
            style={{ opacity }}
            className="text-center mb-20"
        >
            <h2 className="font-display font-bold text-4xl md:text-6xl text-white mb-6 glitch-text drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]" data-text="LOGS">
                <span className="text-cyber-secondary">LOGS</span>
            </h2>
            <p className="text-gray-200 max-w-2xl mx-auto font-mono backdrop-blur-sm bg-black/30 px-6 py-4 rounded-lg border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
                Track the destruction. Real-time PnL tracking of the Counter bot ecosystem.
                See the profits pile up as we raid the liquidity pools.
            </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
            {stats.map((stat, index) => (
                <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-black/40 border border-white/20 p-6 backdrop-blur-md hover:border-cyber-primary/50 hover:bg-black/50 transition-all group duration-300 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
                >
                    <div className="flex justify-between items-start mb-4">
                        <div className={`p-3 rounded bg-black/50 ${stat.color} group-hover:scale-110 transition-transform`}>
                            <stat.icon className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-mono text-gray-500 group-hover:text-white transition-colors">LIVE</span>
                    </div>
                    <div className="font-display font-bold text-3xl text-white mb-2 group-hover:text-cyber-primary transition-colors">
                        {stat.value}
                    </div>
                    <div className="text-sm text-gray-400 font-mono">
                        {stat.label}
                    </div>
                </motion.div>
            ))}
        </div>

        {/* Main Chart Simulation */}
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="w-full h-[400px] bg-black/60 backdrop-blur-md border border-white/20 rounded-xl relative overflow-hidden flex items-end p-8 gap-2 shadow-[0_8px_32px_rgba(0,0,0,0.8)]"
        >
            {/* Grid Lines */}
            <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 pointer-events-none">
                {[...Array(24)].map((_, i) => (
                    <div key={i} className="border-r border-t border-white/5" />
                ))}
            </div>

            {/* Simulated Bar Chart with Animation */}
            {[...Array(30)].map((_, i) => {
                const height = Math.random() * 80 + 10; // Random height 10-90%
                return (
                    <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        whileInView={{ height: `${height}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: i * 0.05, ease: "circOut" }}
                        className="flex-1 bg-gradient-to-t from-cyber-primary/20 to-cyber-primary hover:from-cyber-secondary/20 hover:to-cyber-secondary transition-colors relative group min-w-[5px] rounded-t-sm"
                    >
                        <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-black text-xs font-bold px-2 py-1 rounded pointer-events-none whitespace-nowrap">
                            Vol: {Math.floor(height * 100)}k
                        </div>
                    </motion.div>
                );
            })}

            {/* Overlay Text */}
            <div className="absolute top-6 right-6 text-right">
                <div className="text-xs text-gray-500 font-mono mb-1">NETWORK ACTIVITY</div>
                <div className="text-xl font-bold text-white flex items-center justify-end gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    HIGH TRAFFIC
                </div>
            </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Analytics;
