import { useMemo, createContext, useContext, useCallback, useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { WalletInfo } from '@shared/schema';

import '@solana/wallet-adapter-react-ui/styles.css';

const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');

interface SolanaContextType {
  walletInfo: WalletInfo | null;
  isConnecting: boolean;
  refreshBalance: () => Promise<void>;
}

const SolanaContext = createContext<SolanaContextType>({
  walletInfo: null,
  isConnecting: false,
  refreshBalance: async () => {},
});

export const useSolana = () => useContext(SolanaContext);

function SolanaContextProvider({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const { publicKey, connected, connecting } = useWallet();
  const [balance, setBalance] = useState<number>(0);

  const refreshBalance = useCallback(async () => {
    if (publicKey) {
      try {
        const res = await fetch(`/api/wallet/${publicKey.toBase58()}/balance`);
        if (res.ok) {
          const data = await res.json();
          const solBalance = Number(data.sol) || 0;
          setBalance(solBalance);
        } else {
          const lamports = await connection.getBalance(publicKey);
          setBalance(lamports / LAMPORTS_PER_SOL);
        }
      } catch (err) {
        console.error('Failed to fetch balance:', err);
        try {
          const lamports = await connection.getBalance(publicKey);
          setBalance(lamports / LAMPORTS_PER_SOL);
        } catch (e) {
          console.error('Fallback balance fetch also failed:', e);
        }
      }
    }
  }, [publicKey, connection]);

  useEffect(() => {
    if (connected && publicKey) {
      refreshBalance();
      const interval = setInterval(refreshBalance, 120000); // Reduced from 10s to 2 min to save RPC quota
      return () => clearInterval(interval);
    }
  }, [connected, publicKey, refreshBalance]);

  const walletInfo: WalletInfo | null = useMemo(() => {
    if (!connected || !publicKey) return null;
    return {
      address: publicKey.toBase58(),
      balance,
      connected: true,
    };
  }, [connected, publicKey, balance]);

  return (
    <SolanaContext.Provider value={{ walletInfo, isConnecting: connecting, refreshBalance }}>
      {children}
    </SolanaContext.Provider>
  );
}

export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SolanaContextProvider>
            {children}
          </SolanaContextProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export { WalletMultiButton };
