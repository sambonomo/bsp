/* --------------------------------------------------------
   src/utils/helpers.js     (FULL FILE – ready to paste)
   -------------------------------------------------------- */
   import { getAnalyticsService } from "../firebase/config";
   import { logEvent }            from "firebase/analytics";
   
   /* ───────── analytics wrapper – now EXPORTED ───────── */
   export function logAnalyticsEvent(name, data = {}) {
     try {
       const analytics = getAnalyticsService();
       if (analytics) logEvent(analytics, name, { ...data, ts: Date.now() });
     } catch {
       /* analytics should never crash the app */
     }
   }
   
   /* ───────── crypto-safe rand int 0 … max-1 ───────── */
   function secureRandomInt(maxExclusive) {
     const cryptoObj = globalThis.crypto || globalThis.msCrypto;
     if (cryptoObj?.getRandomValues) {
       const uint = new Uint8Array(1);
       cryptoObj.getRandomValues(uint);
       return uint[0] % maxExclusive;
     }
     return Math.floor(Math.random() * maxExclusive);
   }
   
   /* ====================================================
      1. Invite Code
      ==================================================== */
   const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
   
   export function generateInviteCode(length = 6) {
     if (typeof length !== "number" || length < 4 || length > 10) {
       const msg = "Length must be between 4 and 10.";
       logAnalyticsEvent("generate_invite_code_failed", { length, msg });
       throw new Error(msg);
     }
   
     let code = "";
     for (let i = 0; i < length; i += 1) {
       code += CODE_CHARS.charAt(secureRandomInt(CODE_CHARS.length));
     }
   
     logAnalyticsEvent("generate_invite_code_success", { length, code });
     console.debug("[helpers] generateInviteCode:", code);
     return code;
   }
   
   /* ====================================================
      2. Fisher–Yates Shuffle
      ==================================================== */
   export function shuffleArray(input) {
     if (!Array.isArray(input) || input.length === 0) {
       const msg = "shuffleArray expects a non-empty array.";
       logAnalyticsEvent("shuffle_array_failed", { input, msg });
       throw new Error(msg);
     }
   
     const arr = [...input];
     for (let i = arr.length - 1; i > 0; i -= 1) {
       const j = secureRandomInt(i + 1);
       [arr[i], arr[j]] = [arr[j], arr[i]];
     }
   
     logAnalyticsEvent("shuffle_array_success", { len: arr.length });
     console.debug("[helpers] shuffleArray result:", arr);
     return arr;
   }
   
   /* ====================================================
      3. Squares Grid Digits
      ==================================================== */
   export function assignGridDigits() {
     const digits  = shuffleArray([0,1,2,3,4,5,6,7,8,9]);
     const result  = { rowDigits: digits, colDigits: shuffleArray(digits) };
   
     logAnalyticsEvent("assign_grid_digits_success");
     console.debug("[helpers] assignGridDigits:", result);
     return result;
   }
   
   /* ====================================================
      4. Strip-Card Numbers
      ==================================================== */
   export function generateStripCardNumbers(count = 10) {
     if (typeof count !== "number" || count < 1 || count > 20) {
       const msg = "Count must be 1 … 20.";
       logAnalyticsEvent("generate_strip_card_numbers_failed", { count, msg });
       throw new Error(msg);
     }
   
     const numbers = Array.from({ length: count }, () => secureRandomInt(10));
     logAnalyticsEvent("generate_strip_card_numbers_success", { count });
     console.debug("[helpers] generateStripCardNumbers:", numbers);
     return numbers;
   }
   
   /* ====================================================
      5. Squares Payout Calculator
      ==================================================== */
   export function calculatePayouts(
     { totalPot = 0, payoutStructure = "default" },
     scores = null
   ) {
     if (typeof totalPot !== "number" || totalPot <= 0) {
       const msg = "Total pot must be a positive number.";
       logAnalyticsEvent("calculate_payouts_failed", { totalPot, msg });
       throw new Error(msg);
     }
   
     const defaultPct = { q1: 0.2, q2: 0.2, q3: 0.2, final: 0.4 };
     const pct        = payoutStructure === "default" ? defaultPct : payoutStructure;
   
     const pctTotal = (pct.q1 + pct.q2 + pct.q3 + pct.final) * 100;
     if (Math.abs(pctTotal - 100) > 1) {
       const msg = "Payout percentages must total 100 %.";
       logAnalyticsEvent("calculate_payouts_failed", { pct, msg });
       throw new Error(msg);
     }
   
     const payouts = {
       q1   : totalPot * pct.q1,
       q2   : totalPot * pct.q2,
       q3   : totalPot * pct.q3,
       final: totalPot * pct.final,
     };
   
     if (scores) payouts.winners = { q1:null, q2:null, q3:null, final:null };
   
     logAnalyticsEvent("calculate_payouts_success", { totalPot, pct });
     console.debug("[helpers] calculatePayouts:", payouts);
     return payouts;
   }
   
   /* ====================================================
      6. Currency Formatter
      ==================================================== */
   export function formatCurrency(amount) {
     if (typeof amount !== "number" || Number.isNaN(amount)) {
       const msg = "Amount must be a valid number.";
       logAnalyticsEvent("format_currency_failed", { amount, msg });
       throw new Error(msg);
     }
   
     const formatted = amount.toLocaleString("en-US", {
       style: "currency",
       currency: "USD",
     });
   
     logAnalyticsEvent("format_currency_success");
     console.debug("[helpers] formatCurrency:", formatted);
     return formatted;
   }
   
   /* ====================================================
      7. Copy-to-Clipboard helper
      ==================================================== */
   export async function copyTextToClipboard(text) {
     try {
       if (navigator.clipboard?.writeText) {
         await navigator.clipboard.writeText(text);
       } else {
         /* fallback for older browsers */
         const textarea = document.createElement("textarea");
         textarea.value = text;
         textarea.style.position = "fixed";
         textarea.style.opacity  = "0";
         document.body.appendChild(textarea);
         textarea.select();
         document.execCommand("copy");
         document.body.removeChild(textarea);
       }
       logAnalyticsEvent("copy_to_clipboard_success");
     } catch (err) {
       logAnalyticsEvent("copy_to_clipboard_failed", { err: err?.message });
       console.error("[helpers] copyTextToClipboard error:", err);
     }
   }
   