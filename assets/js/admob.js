// ============================================================
// admob.js — AdMob Ads Handler (Capacitor Native Android)
// PrintTrack — SNMC
// ============================================================

const ADMOB_CONFIG = {
  // Test Ad Unit IDs provided by Google (Safe for development)
  bannerAdId: "ca-app-pub-3940256099942544/6300978111",      // Test Banner
  interstitialAdId: "ca-app-pub-3940256099942544/1033173712", // Test Interstitial
  rewardedAdId: "ca-app-pub-3940256099942544/5224354917",     // Test Rewarded
  isTesting: true
};

async function initAdMob() {
  if (typeof window.Capacitor === "undefined") {
    console.log("[AdMob] Running in Web Browser mode (Native AdMob skipped).");
    return;
  }

  try {
    const { AdMob, BannerAdSize, BannerAdPosition } = window.Capacitor.Plugins;
    if (!AdMob) return;

    await AdMob.initialize({
      requestTrackingAuthorization: true,
      testingDevices: ["EMULATOR"],
      initializeForTesting: ADMOB_CONFIG.isTesting
    });

    console.log("[AdMob] Initialized successfully.");
    await showBannerAd();
  } catch (err) {
    console.warn("[AdMob] Init warning:", err.message);
  }
}

async function showBannerAd() {
  if (typeof window.Capacitor === "undefined") return;
  try {
    const { AdMob, BannerAdSize, BannerAdPosition } = window.Capacitor.Plugins;
    if (!AdMob) return;

    await AdMob.showBanner({
      adId: ADMOB_CONFIG.bannerAdId,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 60,
      isTesting: ADMOB_CONFIG.isTesting
    });
  } catch (err) {
    console.warn("[AdMob] Show banner failed:", err.message);
  }
}

async function showInterstitialAd() {
  if (typeof window.Capacitor === "undefined") return;
  try {
    const { AdMob } = window.Capacitor.Plugins;
    if (!AdMob) return;

    await AdMob.prepareInterstitial({
      adId: ADMOB_CONFIG.interstitialAdId,
      isTesting: ADMOB_CONFIG.isTesting
    });
    await AdMob.showInterstitial();
  } catch (err) {
    console.warn("[AdMob] Show interstitial failed:", err.message);
  }
}

// Auto initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  initAdMob().catch(() => {});
});
