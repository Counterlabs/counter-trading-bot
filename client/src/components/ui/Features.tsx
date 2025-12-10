import { motion } from 'framer-motion';
import { Target, Zap, Shield, BarChart3, Fingerprint, Cpu } from 'lucide-react';

const features = [
  {
    icon: Target,
    title: 'Snipe Mode',
    description: 'Instant buy on bonding curve creation.',
    stat: 'FAST',
    color: 'text-cyber-primary'
  },
  {
    icon: Zap,
    title: 'God Mode Speed',
    description: 'Front-run every transaction.',
    stat: '0.00ms',
    color: 'text-yellow-400'
  },
  {
    icon: Shield,
    title: 'Rug Protection',
    description: 'Auto-sell detected if dev dumps.',
    stat: 'SAFE',
    color: 'text-green-400'
  },
  {
    icon: BarChart3,
    title: 'Mayhem Metrics',
    description: 'Track chaos in real-time.',
    stat: 'LIVE',
    color: 'text-cyber-secondary'
  },
  {
    icon: Fingerprint,
    title: 'Anti-MEV Shield',
    description: 'Private node routing for stealth.',
    stat: 'GHOST',
    color: 'text-purple-400'
  },
  {
    icon: Cpu,
    title: 'Auto-Compounder',
    description: 'Reinvest profits automatically.',
    stat: 'MAX',
    color: 'text-blue-400'
  },
];

const Features = () => {
  return (
    <section id="features" className="relative py-32 bg-[#050505] z-10 border-t border-white/5">
      {/* Dark overlay for consistency */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/40 pointer-events-none" />

      <div className="container mx-auto px-4 relative">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: index * 0.1, ease: "easeOut" }}
              className="group relative p-8 bg-black/50 backdrop-blur-sm border border-white/10 hover:border-cyber-primary/50 transition-all duration-300 hover:-translate-y-2 overflow-hidden will-change-transform transform-gpu shadow-[0_8px_32px_rgba(0,0,0,0.6)] hover:shadow-[0_8px_32px_rgba(0,243,255,0.2)]"
            >
              {/* Hover Gradient Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-cyber-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <div className="flex justify-between items-start mb-8 relative z-10">
                <div className={`p-3 rounded bg-white/5 group-hover:bg-white/10 transition-colors ${feature.color}`}>
                    <feature.icon className="w-6 h-6" />
                </div>
                <span className="font-mono text-[10px] text-gray-500 border border-white/10 px-2 py-1 rounded group-hover:border-cyber-primary/50 group-hover:text-cyber-primary transition-colors">
                  {feature.stat}
                </span>
              </div>

              <div className="relative z-10">
                <h3 className="font-display font-bold text-xl text-white mb-3 group-hover:text-cyber-primary transition-colors">
                  {feature.title}
                </h3>
                <p className="text-gray-500 font-mono text-sm leading-relaxed group-hover:text-gray-400 transition-colors">
                  {feature.description}
                </p>
              </div>

              {/* Corner Accents */}
              <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-white/20 group-hover:border-cyber-primary transition-colors" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-white/20 group-hover:border-cyber-primary transition-colors" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
