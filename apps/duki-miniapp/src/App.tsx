import { useState, useEffect, useCallback } from "react";
import {
  MiniKit,
  VerifyCommandInput,
  VerificationLevel,
  MiniAppVerifyActionSuccessPayload,
} from "@worldcoin/minikit-js";
import { createPublicClient, http, formatEther } from "viem";
import { worldchain } from "viem/chains";
import { almWorldDukiDistributorAbi as DISTRIBUTOR_ABI } from "contract-duki-alm-world/generated";
import DukiBanner from "./components/DukiBanner";
import HowItWorks from "./pages/HowItWorks";
import { useLocale, type Locale } from "./lib/i18n";

// ─── Config ───
const APP_ID = import.meta.env.VITE_WLD_APP_ID || "";
const ACTION_ID = import.meta.env.VITE_WLD_ACTION_ID || "duki-claim";
const DISTRIBUTOR = import.meta.env.VITE_DISTRIBUTOR_ADDRESS as `0x${string}`;
const RPC_URL = import.meta.env.VITE_WORLD_CHAIN_RPC;

const client = createPublicClient({
  chain: worldchain,
  transport: http(RPC_URL),
});

// ─── Types ───
interface RoundInfo {
  round: bigint;
  recipientCount: bigint;
  threshold: bigint;
  claimed: bigint;
  amountPerPerson: bigint;
  dukiBalance: bigint;
  nextRoundTime: bigint;
}

type ClaimStatus = "idle" | "verifying" | "claiming" | "success" | "error";
type Page = "claim" | "how";

// ─── Simple hash router ───
function getPageFromHash(): Page {
  const hash = window.location.hash;
  if (hash === "#/how") return "how";
  return "claim";
}

export default function App() {
  const { t, locale, setLocale } = useLocale();
  const [page, setPage] = useState<Page>(getPageFromHash);
  const [miniKitReady, setMiniKitReady] = useState(false);
  const [roundInfo, setRoundInfo] = useState<RoundInfo | null>(null);
  const [canClaim, setCanClaim] = useState(false);
  const [status, setStatus] = useState<ClaimStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Hash-based navigation
  useEffect(() => {
    const onHash = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (p: Page) => {
    window.location.hash = p === "claim" ? "#/" : "#/how";
    setPage(p);
  };

  // ─── Initialize MiniKit ───
  useEffect(() => {
    MiniKit.install(APP_ID);
    const timer = setTimeout(() => {
      setMiniKitReady(MiniKit.isInstalled());
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // ─── Fetch round info ───
  const fetchRoundInfo = useCallback(async () => {
    if (!DISTRIBUTOR || DISTRIBUTOR === "0x0000000000000000000000000000000000000000") return;
    try {
      const [info, distributable] = await Promise.all([
        client.readContract({
          address: DISTRIBUTOR,
          abi: DISTRIBUTOR_ABI,
          functionName: "getRoundInfo",
        }),
        client.readContract({
          address: DISTRIBUTOR,
          abi: DISTRIBUTOR_ABI,
          functionName: "canDistribute",
        }),
      ]);

      setRoundInfo({
        round: info[0],
        recipientCount: info[1],
        threshold: info[2],
        claimed: info[3],
        amountPerPerson: info[4],
        dukiBalance: info[5],
        nextRoundTime: info[6],
      });
      setCanClaim(distributable);
    } catch (e) {
      console.log("Contract not deployed yet or RPC error:", e);
    }
  }, []);

  useEffect(() => {
    fetchRoundInfo();
    const interval = setInterval(fetchRoundInfo, 15000);
    return () => clearInterval(interval);
  }, [fetchRoundInfo]);

  // ─── Claim flow ───
  const handleClaim = async () => {
    if (!MiniKit.isInstalled()) {
      setErrorMsg(t.openInWorldApp);
      setStatus("error");
      return;
    }

    setStatus("verifying");
    setErrorMsg("");

    try {
      const verifyPayload: VerifyCommandInput = {
        action: ACTION_ID,
        verification_level: VerificationLevel.Orb,
      };

      const { finalPayload } = await MiniKit.commandsAsync.verify(verifyPayload);

      if (finalPayload.status === "error") {
        setErrorMsg("World ID verification failed");
        setStatus("error");
        return;
      }

      const proof = finalPayload as MiniAppVerifyActionSuccessPayload;

      setStatus("claiming");

      const { finalPayload: txPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: DISTRIBUTOR,
            abi: DISTRIBUTOR_ABI,
            functionName: "claim",
            args: [
              MiniKit.walletAddress as `0x${string}`,
              BigInt(proof.merkle_root),
              BigInt(proof.nullifier_hash),
              proof.proof.map((p: string) => BigInt(p)) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
            ],
          },
        ],
      });

      if (txPayload.status === "error") {
        setErrorMsg("Transaction failed");
        setStatus("error");
        return;
      }

      setStatus("success");
      fetchRoundInfo();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  };

  // ─── Render ───
  return (
    <div style={styles.container}>
      {/* Header Banner */}
      <DukiBanner />

      {/* Navigation Tabs */}
      <nav style={styles.nav}>
        <button
          style={{ ...styles.navTab, ...(page === "claim" ? styles.navTabActive : {}) }}
          onClick={() => navigate("claim")}
        >
          {t.navClaim}
        </button>
        <button
          style={{ ...styles.navTab, ...(page === "how" ? styles.navTabActive : {}) }}
          onClick={() => navigate("how")}
        >
          {t.navHow}
        </button>

        {/* Locale switcher */}
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          style={styles.localeSwitcher}
        >
          <option value="en">EN</option>
          <option value="zhCN">简中</option>
          <option value="zhTW">繁中</option>
        </select>
      </nav>

      {/* Page Content */}
      {page === "claim" ? (
        <>
          {/* Round Info Card */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>{t.currentRound}</h2>
            {roundInfo ? (
              <div style={styles.stats}>
                <Stat label={t.round} value={`#${roundInfo.round.toString()}`} />
                <Stat label={t.perPerson} value={`${formatEther(roundInfo.amountPerPerson)} DUKI`} />
                <Stat
                  label={t.claimed}
                  value={`${roundInfo.claimed} / ${roundInfo.recipientCount}`}
                />
                <Stat label={t.pool} value={`${formatEther(roundInfo.dukiBalance)} DUKI`} />
              </div>
            ) : (
              <p style={styles.dimText}>
                {DISTRIBUTOR === "0x0000000000000000000000000000000000000000"
                  ? t.contractNotDeployed
                  : t.loading}
              </p>
            )}
          </div>

          {/* Status Badge */}
          {canClaim && (
            <div style={styles.badge}>
              <span style={styles.badgeDot} />
              {t.roundActive}
            </div>
          )}

          {/* Claim Button */}
          <button
            style={{
              ...styles.claimButton,
              ...(status === "verifying" || status === "claiming"
                ? styles.claimButtonDisabled
                : {}),
              ...(status === "success" ? styles.claimButtonSuccess : {}),
            }}
            onClick={handleClaim}
            disabled={status === "verifying" || status === "claiming"}
          >
            {status === "idle" && t.claimDuki}
            {status === "verifying" && t.verifying}
            {status === "claiming" && t.sendingTx}
            {status === "success" && t.claimedSuccess}
            {status === "error" && t.tryAgain}
          </button>

          {/* Error message */}
          {status === "error" && <p style={styles.error}>{errorMsg}</p>}

          {/* MiniKit status */}
          {!miniKitReady && (
            <p style={styles.dimText}>{t.miniKitNotDetected}</p>
          )}
        </>
      ) : (
        <HowItWorks />
      )}

      {/* Footer */}
      <p style={styles.footer}>
        {t.advocatedBy} ALLLIVESMATTER.WORLD
      </p>
    </div>
  );
}

// ─── Stat component ───
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.stat}>
      <span style={styles.statLabel}>{label}</span>
      <span style={styles.statValue}>{value}</span>
    </div>
  );
}

// ─── Styles ───
const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "100%",
    maxWidth: 420,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  nav: {
    width: "100%",
    display: "flex",
    gap: 0,
    background: "var(--bg-card)",
    borderRadius: "var(--radius)",
    padding: 3,
    border: "1px solid rgba(255,255,255,0.06)",
    alignItems: "center",
  },
  navTab: {
    flex: 1,
    padding: "10px 0",
    borderRadius: "calc(var(--radius) - 2px)",
    background: "transparent",
    color: "var(--text-dim)",
    fontSize: 13,
    fontWeight: 600,
    transition: "all 0.2s ease",
    letterSpacing: "0.02em",
  },
  navTabActive: {
    background: "rgba(108, 99, 255, 0.15)",
    color: "#e8e8f0",
    boxShadow: "0 1px 8px rgba(108, 99, 255, 0.2)",
  },
  localeSwitcher: {
    background: "transparent",
    color: "var(--text-dim)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: "4px 6px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    marginLeft: 4,
    marginRight: 4,
    outline: "none",
  },
  card: {
    width: "100%",
    background: "var(--bg-card)",
    borderRadius: "var(--radius)",
    padding: "20px 24px",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-dim)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    marginBottom: 16,
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  stat: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "var(--text-dim)",
  },
  statValue: {
    fontSize: 18,
    fontWeight: 600,
  },
  dimText: {
    fontSize: 13,
    color: "var(--text-dim)",
    textAlign: "center" as const,
  },
  badge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(52, 211, 153, 0.1)",
    color: "var(--success)",
    borderRadius: 99,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 500,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    background: "var(--success)",
    animation: "pulse 2s infinite",
  },
  claimButton: {
    width: "100%",
    padding: "16px 24px",
    borderRadius: "var(--radius)",
    background: "linear-gradient(135deg, #6c63ff, #5a52e0)",
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
    boxShadow: "0 4px 24px var(--accent-glow)",
    transition: "all 0.2s ease",
    marginTop: 4,
  },
  claimButtonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  claimButtonSuccess: {
    background: "linear-gradient(135deg, #34d399, #059669)",
  },
  error: {
    color: "var(--error)",
    fontSize: 13,
    textAlign: "center" as const,
  },
  footer: {
    fontSize: 11,
    color: "var(--text-dim)",
    marginTop: "auto",
    paddingTop: 16,
    opacity: 0.6,
  },
};
