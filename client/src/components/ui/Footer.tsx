import { Github, Twitter, Disc, Send, BookOpen } from 'lucide-react';
import counterLogo from '@assets/Mark-white_1764174965731.png';

const Footer = () => {
  return (
    <footer className="relative bg-[#030303] z-10 border-t border-white/10 pt-20 pb-12">
      {/* Dark overlay for consistency */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/60 pointer-events-none" />

      <div className="container mx-auto px-4 relative">
        <div className="flex flex-col md:flex-row justify-between items-start mb-20">
          <div className="max-w-md mb-12 md:mb-0">
            <div className="flex items-center gap-3 mb-6">
              <img 
                src={counterLogo} 
                alt="Counter" 
                className="w-10 h-10"
                data-testid="img-logo-footer"
              />
              <h2 className="font-display font-bold text-2xl text-white tracking-tighter">
                counter
              </h2>
            </div>
            <p className="text-gray-300 font-mono text-sm leading-relaxed mb-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              The only bot you need for Pump.fun domination. Unleash the counter today.
              Visualizing the destruction of liquidity pools.
            </p>
            <div className="flex space-x-6">
              <a 
                href="https://x.com/counterlabs" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-gray-500 hover:text-cyber-primary transition-colors"
                data-testid="link-twitter"
              >
                <Twitter className="w-5 h-5" />
              </a>
              <a 
                href="https://countersol.gitbook.io/counter-1/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-gray-500 hover:text-cyber-primary transition-colors"
                data-testid="link-docs"
              >
                <BookOpen className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-500 hover:text-cyber-primary transition-colors">
                <Github className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-500 hover:text-cyber-primary transition-colors">
                <Disc className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-500 hover:text-cyber-primary transition-colors">
                <Send className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-16 md:gap-32 font-mono text-sm">
            <div>
              <h4 className="text-white mb-6 uppercase tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">Platform</h4>
              <ul className="space-y-4 text-gray-300">
                <li><a href="#" className="hover:text-white transition-colors">Console</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Logs</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Staking</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Manifesto</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white mb-6 uppercase tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">Legal</h4>
              <ul className="space-y-4 text-gray-300">
                <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Risk</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center text-gray-400 font-mono text-xs">
          <p>© 2025 Counter Labs.</p>
          <div className="flex items-center gap-2 mt-4 md:mt-0">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
            ALL SYSTEMS OPERATIONAL
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
