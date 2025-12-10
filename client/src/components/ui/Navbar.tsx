import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import counterLogo from '@assets/Mark-white_1764174965731.png';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Console', href: '#terminal' },
    { name: 'Logs', href: '#analytics' },
    { name: 'Roadmap', href: '#roadmap' },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
        scrolled ? 'bg-black/70 backdrop-blur-md border-b border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.6)]' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="flex items-center justify-between h-24">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center gap-3 cursor-pointer group" onClick={() => window.scrollTo(0,0)}>
            <img 
              src={counterLogo} 
              alt="Counter" 
              className="w-10 h-10 transition-transform group-hover:scale-110"
              data-testid="img-logo-navbar"
            />
            <span className="font-display font-bold text-xl tracking-tight text-white group-hover:text-cyber-primary transition-colors">
              counter
            </span>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-12">
            <div className="flex items-baseline space-x-8 font-mono text-sm">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="text-gray-400 hover:text-white transition-colors uppercase tracking-wide"
                >
                  {link.name}
                </a>
              ))}
            </div>
            <a href="/app">
              <button className="relative px-6 py-3 border border-white/30 text-white font-mono text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-all group backdrop-blur-sm bg-black/20 shadow-[0_4px_16px_rgba(0,0,0,0.6)] hover:shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                <span className="relative z-10">INITIATE COUNTER</span>
              </button>
            </a>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-white p-2"
            >
              {isOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: '100vh' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-[#050505] fixed inset-0 top-24 z-40"
          >
            <div className="flex flex-col p-8 space-y-8 font-display text-2xl font-bold text-white">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="hover:text-cyber-primary transition-colors"
                >
                  {link.name}
                </a>
              ))}
              <a href="#" className="text-cyber-primary pt-8 border-t border-white/10">
                INITIATE COUNTER -&gt;
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
