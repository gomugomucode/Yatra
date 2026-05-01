'use client';

import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';

import '@solana/wallet-adapter-react-ui/styles.css';

const DEVNET_ENDPOINT = 'https://api.devnet.solana.com';

export default function WalletProviderWrapper({ children }: { children: React.ReactNode }) {
    const wallets = useMemo(() => [], []);

    return (
        <ConnectionProvider endpoint={DEVNET_ENDPOINT}>
            <WalletProvider wallets={wallets} autoConnect={false}>
                <WalletModalProvider>
                    {children}
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}
