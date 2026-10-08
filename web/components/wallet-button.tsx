"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { activeChain, explorerAddressUrl } from "@/lib/chains";
import { buttonClasses } from "@/components/ui/button";

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Network guard for every transaction screen.
 * `isRightChain` is true only when a wallet is connected to the active Robinhood Chain.
 */
export function useRightChain() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();
  const isRightChain = isConnected && chainId === activeChain.id;
  const isWrongChain = isConnected && chainId !== activeChain.id;
  return {
    isConnected,
    chainId,
    targetChain: activeChain,
    isRightChain,
    isWrongChain,
    isSwitching,
    switchError,
    switchToRightChain: () => switchChain({ chainId: activeChain.id }),
  };
}

function connectorLabel(c: Connector): string {
  if (c.id === "injected") return "Browser wallet";
  if (c.id === "walletConnect") return "WalletConnect";
  if (c.id === "coinbaseWalletSDK") return "Coinbase Wallet";
  return c.name;
}

export function WalletButton({ className = "" }: { className?: string }) {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const { connectors, connect, isPending, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { isWrongChain, isSwitching, switchToRightChain } = useRightChain();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // EIP-6963 wallets are discovered as their own connectors; hide the generic
  // "injected" entry when at least one named browser wallet was found.
  const list = useMemo(() => {
    const discovered = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
    const seen = new Set<string>();
    return connectors.filter((c) => {
      if (c.id === "injected" && discovered.length > 0) return false;
      const key = connectorLabel(c);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [connectors]);

  useEffect(() => {
    if (!modalOpen && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalOpen(false);
        setMenuOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [modalOpen, menuOpen]);

  if (isConnected && address && isWrongChain) {
    return (
      <button
        type="button"
        onClick={() => switchToRightChain()}
        disabled={isSwitching}
        className={buttonClasses("danger", "sm", className)}
      >
        {isSwitching ? "SWITCHING…" : "WRONG NETWORK — SWITCH"}
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div ref={menuRef} className={`relative ${className}`}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className={buttonClasses("secondary", "sm", "gap-2")}
        >
          <span className="inline-block size-1.5 bg-lime" aria-hidden="true" />
          {shortAddress(address)}
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+6px)] z-50 w-56 border border-ink-3 bg-paper p-[3px]"
          >
            <div className="border border-ink-3">
              <div className="stamp border-b border-ink-3 px-3 py-2 text-[10px] text-ink-2">
                {activeChain.name.toUpperCase()}
              </div>
              <a
                role="menuitem"
                href={explorerAddressUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="stamp block px-3 py-3 text-[12px] text-ink hover:bg-ink hover:text-paper"
              >
                VIEW ON EXPLORER
              </a>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  disconnect();
                }}
                className="stamp block w-full border-t border-ink-3 px-3 py-3 text-left text-[12px] text-ink hover:bg-ink hover:text-paper"
              >
                DISCONNECT
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const busy = isConnecting || isReconnecting || isPending;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setModalOpen(true);
        }}
        className={buttonClasses("primary", "sm", className)}
      >
        {busy ? "CONNECTING…" : "CONNECT"}
      </button>
      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-paper/80 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-modal-title"
            className="w-full max-w-sm border border-ink-3 bg-paper p-[3px]"
          >
            <div className="border border-ink-3">
              <div className="flex items-center justify-between border-b border-ink-3 px-4 py-3">
                <h2 id="wallet-modal-title" className="stamp text-[13px] text-lime">
                  CONNECT A WALLET
                </h2>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="stamp text-[12px] text-ink-2 hover:text-ink"
                  aria-label="Close"
                >
                  CLOSE
                </button>
              </div>
              <ul>
                {list.map((c) => (
                  <li key={c.uid} className="border-b border-ink-3 last:border-b-0">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        connect(
                          { connector: c, chainId: activeChain.id },
                          { onSuccess: () => setModalOpen(false) },
                        )
                      }
                      className="flex w-full items-center justify-between px-4 py-4 text-left text-[15px] text-ink hover:bg-ink hover:text-paper disabled:opacity-50"
                    >
                      <span>{connectorLabel(c)}</span>
                      <span className="stamp text-[11px] opacity-60">→</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-ink-3 px-4 py-3 text-[12px] leading-relaxed text-ink-2">
                {error ? (
                  <span className="text-danger">{error.message.split("\n")[0]}</span>
                ) : (
                  <>Network: {activeChain.name}. Gas is paid in ETH. Payments and collateral are in USDG.</>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
