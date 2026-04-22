'use client';

import dynamic from 'next/dynamic';

const WalletProviderWrapper = dynamic(
    () => import('./WalletProviderWrapper'),
    { ssr: false, loading: () => null }
);

export default function ClientWalletProvider({ children }: { children: React.ReactNode }) {
    return <WalletProviderWrapper>{children}</WalletProviderWrapper>;
}
