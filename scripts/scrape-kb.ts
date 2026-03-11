#!/usr/bin/env npx tsx
/**
 * Scrape Zeffy Knowledge Base articles from support.zeffy.com
 * and populate the kb_articles table in Supabase.
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/scrape-kb.ts
 *
 * Or if you have a .env file, use: npx dotenv -- npx tsx scripts/scrape-kb.ts
 */

import { createClient } from "@supabase/supabase-js";

// Use service role key if available, fallback to anon key
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://wuepkorqdnabfxtynytf.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1ZXBrb3JxZG5hYmZ4dHlueXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzgyNTIsImV4cCI6MjA4ODU1NDI1Mn0.z8AdcXBjFLAYkS0cs-AZKXYQw3I019DdK4VvyKUIhKQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// All English KB article URLs from sitemap
const KB_URLS = [
  "https://support.zeffy.com/which-form-should-i-choose",
  "https://support.zeffy.com/can-i-use-zeffy-for-concession-sales",
  "https://support.zeffy.com/how-to-get-started-on-zeffy",
  "https://support.zeffy.com/can-you-connect-a-savings-account-for-payouts",
  "https://support.zeffy.com/emailing-in-zeffy",
  "https://support.zeffy.com/can-i-export-a-list-of-all-my-tax-receipts",
  "https://support.zeffy.com/can-a-ticket-be-forced-in-all-purchases",
  "https://support.zeffy.com/how-do-i-set-up-a-donation-form",
  "https://support.zeffy.com/how-to-update-names-of-my-event-guests-after-their-purchase",
  "https://support.zeffy.com/sell-tickets-for-free.-no-fees.-no-catch",
  "https://support.zeffy.com/email-data-and-statuses-in-zeffy",
  "https://support.zeffy.com/enabling-fund-selection-for-donors-in-your-zeffy-campaigns",
  "https://support.zeffy.com/connecting-multiple-bank-accounts-to-zeffy",
  "https://support.zeffy.com/how-to-manage-a-raffle-with-online-and-paper/in-person-ticket-sales",
  "https://support.zeffy.com/how-to-use-zapiers-formatter-to-separate-data-fields",
  "https://support.zeffy.com/why-was-i-charged-by-zeffy-what-is-the-contribution-made-toward-zeffy-1",
  "https://support.zeffy.com/i-am-waiting-for-my-501c3-/nonprofit-status-can-i-start-using-zeffy",
  "https://support.zeffy.com/viewing-your-auction-winners-and",
  "https://support.zeffy.com/how-do-i-set-up-a-store-on-zeffy",
  "https://support.zeffy.com/zeffy-onboarding-academy",
  "https://support.zeffy.com/do-you-integrate-with-other-tools",
  "https://support.zeffy.com/attendance-reports",
  "https://support.zeffy.com/how-to-delete-my-account",
  "https://support.zeffy.com/how-to-transfer-bank-account-ownership",
  "https://support.zeffy.com/new-canadian-stripe-requirements-for-august-7th",
  "https://support.zeffy.com/create-a-captivating-online-raffle-event",
  "https://support.zeffy.com/can-e-tickets-and-membership-cards-be-added-to-wallet",
  "https://support.zeffy.com/how-i-can-activate-my-zeffy-account",
  "https://support.zeffy.com/how-to-set-up-automatic-tax-receipts-1",
  "https://support.zeffy.com/how-do-i-change-my-payout-schedule",
  "https://support.zeffy.com/how-often/-when-do-i-get-my-payout",
  "https://support.zeffy.com/how-can-i-stay-up-to-date-on-zeffy-technical-issues-downs-and-updates-on-bugs",
  "https://support.zeffy.com/how-can-i-create-a-volunteering-opportunity-and-receive-volunteer-registrations",
  "https://support.zeffy.com/how-to-automate-your-newsletter-subscriber-list-in-zeffy",
  "https://support.zeffy.com/can-i-cancel/delete-a-bid",
  "https://support.zeffy.com/troubleshooting-the-tap-to-pay-app-android",
  "https://support.zeffy.com/how-can-i-register-for-zeffys-weekly-demo",
  "https://support.zeffy.com/zeffy-tax-guide",
  "https://support.zeffy.com/edit-the-signature-on-your-tax-receipt",
  "https://support.zeffy.com/your-ein-verification-is-failing/not-working-watch-this-video",
  "https://support.zeffy.com/is-paypal-a-giving-option",
  "https://support.zeffy.com/how-to-set-up-peer-to-peer-fundraising-a-guide-for-schools",
  "https://support.zeffy.com/configuring-a-reminder-email",
  "https://support.zeffy.com/verification-faq",
  "https://support.zeffy.com/how-can-i-set-a-maximum-number-of-tickets-for-my-ticketing-form-how-can-i-sell-a-limited-amount-of-tickets-for-my-event",
  "https://support.zeffy.com/where-can-i-find-the-qr-code-to-share-my-form",
  "https://support.zeffy.com/can-i-cancel-a-refund-on-zeffy",
  "https://support.zeffy.com/how-can-i-translate-my-form",
  "https://support.zeffy.com/how-can-i-add-a-payment-descriptor-for-my-donors",
  "https://support.zeffy.com/how-do-i-delete-a-donation-or-ticketing-form",
  "https://support.zeffy.com/how-can-i-delete-a-donation",
  "https://support.zeffy.com/supported-countries-and-currencies",
  "https://support.zeffy.com/does-zeffy-support-monthly-donations",
  "https://support.zeffy.com/why-does-my-form-say-it-is-closed",
  "https://support.zeffy.com/how-can-donors-unsubscribe",
  "https://support.zeffy.com/how-to-talk-about-zeffy",
  "https://support.zeffy.com/how-to-reset-your-password",
  "https://support.zeffy.com/how-to-recover-a-deleted-form",
  "https://support.zeffy.com/how-do-i-move-a-donation",
  "https://support.zeffy.com/zeffy-samples",
  "https://support.zeffy.com/how-do-i-set-up-a-raffle-on-zeffy",
  "https://support.zeffy.com/common-payment-errors-on-zeffy-troubleshooting-guide-for-donors",
  "https://support.zeffy.com/how-can-i-set-up-partial-tax-receipts",
  "https://support.zeffy.com/how-can-i-edit-or-cancel-my-monthly-donation",
  "https://support.zeffy.com/when-and-how-auction-winners-are-charged-for-their-bids",
  "https://support.zeffy.com/memoriam-donations",
  "https://support.zeffy.com/how-to-transfer-ownership-and-remove-users",
  "https://support.zeffy.com/how-can-i-send-my-buyers-an-invoice-or-receipt",
  "https://support.zeffy.com/protect-your-account-if-theres-unfamiliar-activity",
  "https://support.zeffy.com/my-donor-made-a-payment-with-the-wrong-name/email-how-do-i-fix-it",
  "https://support.zeffy.com/what-can-i-do-on-my-donors-profile-page",
  "https://support.zeffy.com/how-do-i-set-up-an-open-registration-peer-to-peer-campaign",
  "https://support.zeffy.com/can-i-add-attachments-to-emails-in-zeffy",
  "https://support.zeffy.com/how-can-i-create-group-tickets-or-ticket-bundles",
  "https://support.zeffy.com/generating-membership-cards",
  "https://support.zeffy.com/cancel-automatic-membership-renewal",
  "https://support.zeffy.com/how-can-i-duplicate-my-campaign-from-last-year",
  "https://support.zeffy.com/manual-payment-or-registration-entries",
  "https://support.zeffy.com/why-does-a-payment-in-my-dashboard-still-say-processing-understanding-ach/pad-payments",
  "https://support.zeffy.com/how-can-i-add-sponsorship-tiers-on-my-zeffy-form",
  "https://support.zeffy.com/how-to-retroactively-assign-table-numbers-to-e-tickets",
  "https://support.zeffy.com/importing-members-and-monthly-donors-with-recurring-payments",
  "https://support.zeffy.com/do-you-contact-our-donors",
  "https://support.zeffy.com/is-it-possible-to-have-a-landing-page-for-our-organization-where-users-can-see-all-of-our-donation-event-and-volunteer-opportunities",
  "https://support.zeffy.com/can-i-change-my-b",
  "https://support.zeffy.com/what-to-do-if-your-event-has-been-cancelled",
  "https://support.zeffy.com/who-can-use-zeffy",
  "https://support.zeffy.com/how-to-cancel-an-auction",
  "https://support.zeffy.com/how-do-i-add-discount-codes",
  "https://support.zeffy.com/ticket-tiers-and-rates",
  "https://support.zeffy.com/importing-payments",
  "https://support.zeffy.com/open-an-online-store.-for-free",
  "https://support.zeffy.com/how-to-delete-a-contact",
  "https://support.zeffy.com/view-and-download-a-report-with-answers-to-custom-questions",
  "https://support.zeffy.com/can-i-print-or-print-out-tickets-or-reports",
  "https://support.zeffy.com/what-is-zeffy-tap-to-pay",
  "https://support.zeffy.com/why-was-i-charged-by-zeffy-what-is-the-contribution-made-toward-zeffy",
  "https://support.zeffy.com/how-to-have-a-donation-form-with-a-free-entry-text-box-only",
  "https://support.zeffy.com/voluntary-contributions-what-happens-if-donors-choose-not-to-contribute",
  "https://support.zeffy.com/how-do-i-cancel-or-refund-a-ticket",
  "https://support.zeffy.com/migrating-to-zeffy-a-step-by-step-guide",
  "https://support.zeffy.com/create-a-raffle-with-more-than-one-prize",
  "https://support.zeffy.com/importing-contacts-into-zeffy",
  "https://support.zeffy.com/filtering-your-ticket-sales-by-ticket-status-and-ticket-type",
  "https://support.zeffy.com/importing-data",
  "https://support.zeffy.com/test-the-platform",
  "https://support.zeffy.com/zeffy-payment-methods",
  "https://support.zeffy.com/voluntary-contribution-refunds-on-zeffy-what-you-need-to-know",
  "https://support.zeffy.com/do-i-need-to-commit-to-zeffy-for-a-long-time",
  "https://support.zeffy.com/how-do-i-set-up-email-notifications",
  "https://support.zeffy.com/how-do-i-edit-/-cancel-a-tax-receipt",
  "https://support.zeffy.com/how-can-i-make-a-payment-on-zeffy",
  "https://support.zeffy.com/can-i-update-my-credit-card-for-an-item-i-bid-on",
  "https://support.zeffy.com/how-do-i-delete-a-team-for-my-peer-to-peer-campaign",
  "https://support.zeffy.com/enabling-offline-/-cash-bids-on-your-auction-forms",
  "https://support.zeffy.com/activating-two-factor-authentication-on-your-account",
  "https://support.zeffy.com/how-to-manage-multiple-accounts",
  "https://support.zeffy.com/importing-data-into-existing-zeffy-forms-capabilities-and-limitations",
  "https://support.zeffy.com/automatic-membership-renewals",
  "https://support.zeffy.com/how-can-i-email-all-my-fundraisers",
  "https://support.zeffy.com/how-can-i-generate-a-manual-tax-receipt",
  "https://support.zeffy.com/how-to-make-an-anonymous-donation",
  "https://support.zeffy.com/how-to-change-your-forms-url-link-in-zeffy",
  "https://support.zeffy.com/how-can-i-edit-my-bank-account-information",
  "https://support.zeffy.com/how-to-set-up-a-custom-redirect-after-form-submission",
  "https://support.zeffy.com/how-can-i-update-my-organization-information",
  "https://support.zeffy.com/how-to-pull-an-list-of-current/active-members",
  "https://support.zeffy.com/set-up-a-multi-date-event",
  "https://support.zeffy.com/understanding-reply-to-email-addresses-in-zeffy-confirmation-emails",
  "https://support.zeffy.com/how-can-i-charge-my-bidder-if-their-auction-payment-fails",
  "https://support.zeffy.com/how-to-offer-member-specific-discounts-on-zeffy",
  "https://support.zeffy.com/why-did-my-payout-fail",
  "https://support.zeffy.com/how-do-i-share-my-form",
  "https://support.zeffy.com/how-do-i-add-a-donate-button-to-my-website",
  "https://support.zeffy.com/how-can-i-add-a-note-to-a-transaction",
  "https://support.zeffy.com/understanding-transaction-statuses",
  "https://support.zeffy.com/can-i-create-pay-what-you-can-tickets",
  "https://support.zeffy.com/how-to-create-a-newsletter-on-zeffy",
  "https://support.zeffy.com/when-do-monthly-donors-receive-tax-receipts",
  "https://support.zeffy.com/where-is-my-tax-receipt",
  "https://support.zeffy.com/view-how-many-tickets-have-been-sold",
  "https://support.zeffy.com/how-can-i-close-my-donation-campaign",
  "https://support.zeffy.com/connecting-an-existing-stripe-account",
  "https://support.zeffy.com/how-to-add-shipping-to-your-zeffy-online-store",
  "https://support.zeffy.com/how-will-imported-data-appear-in-zeffy",
  "https://support.zeffy.com/a-guide-to-image-uploads",
  "https://support.zeffy.com/can-i-set-another-level-of-product-or-ticket-availability",
  "https://support.zeffy.com/how-to-add-early-bird-ticketing-or-a-ticket-waitlist",
  "https://support.zeffy.com/cheque-payments-enabling-cheque-as-a-payment-method-on-your-form",
  "https://support.zeffy.com/how-can-i-integrate-zeffy-with-google-analytics",
  "https://support.zeffy.com/do-you-provide-text-to-give",
  "https://support.zeffy.com/utm-tracking-on-zeffy-forms",
  "https://support.zeffy.com/campaign-communications-schedule-emails-before-and-after-your-campaign",
  "https://support.zeffy.com/is-zeffy-a-licensed-electronic-raffle-system",
  "https://support.zeffy.com/creating-and-configuring-an-auction-form",
  "https://support.zeffy.com/how-can-i-reconcile-my-zeffy-reports",
  "https://support.zeffy.com/how-can-i-update-my-fundraiser-page",
  "https://support.zeffy.com/why-a-form-states-it-is-full-and-how-to-make-more-tickets-available",
  "https://support.zeffy.com/can-i-integrate-zeffy-as-a-payment-module-to-my-current-google-form-or-ecommerce-set-up",
  "https://support.zeffy.com/do-you-have-an-open-source-api",
  "https://support.zeffy.com/integrating-zeffy-with-zapier",
  "https://support.zeffy.com/how-to-handle-increasing-your-membership-price",
  "https://support.zeffy.com/how-to-handle-in-person-auction-payments",
  "https://support.zeffy.com/how-can-i-set-up-an-event-on-zeffy",
  "https://support.zeffy.com/issuing-refunds-how-they-work-and-what-happens-when-you-issue-a-refund",
  "https://support.zeffy.com/connecting-your-zeffy-account-to-swiftaid-to-claim-gift-aid",
  "https://support.zeffy.com/changing-a-donors-email-address-or-merging-two-contacts-together",
  "https://support.zeffy.com/how-do-i-export-my-donation/ticketing-data-how-do-i-export-data-from-my-donation-campaign/ticketing-event-can-i-export-donor-data",
  "https://support.zeffy.com/disputes-and-chargebacks",
  "https://support.zeffy.com/how-can-i-edit-the-thank-you-email-to-my-donors",
  "https://support.zeffy.com/how-can-i-add-taxes-to-my-ticket-items",
  "https://support.zeffy.com/how-do-i-export-my-data-for-accounting",
  "https://support.zeffy.com/can-i-set-a-membership-duration-for-only-6-months",
  "https://support.zeffy.com/how-to-delete-or-undo-a-data-import",
  "https://support.zeffy.com/how-can-i-initiate-a-payout-",
  "https://support.zeffy.com/what-is-stripe",
  "https://support.zeffy.com/accept-in-person-payments",
  "https://support.zeffy.com/add-or-remove-a-target-on-a-campaign",
  "https://support.zeffy.com/how-can-i-close-my-ticket-sales",
  "https://support.zeffy.com/how-to-verify-your-email-address-on-zeffy",
  "https://support.zeffy.com/how-to-send-an-email-to-some-of-your-contacts",
  "https://support.zeffy.com/how-can-i-add-items-to-my-auction",
  "https://support.zeffy.com/how-to-process-payment-instalments-on-zeffy",
  "https://support.zeffy.com/what-does-advantage-amount-mean",
  "https://support.zeffy.com/stripe-verification-process",
  "https://support.zeffy.com/how-can-i-generate-a-tax-receipt-for-an-in-kind-donation",
  "https://support.zeffy.com/how-to-use-zeffy-email-templates",
  "https://support.zeffy.com/send-physical-letters-to-your-donors-using-zeffys-postal-mail-feature",
  "https://support.zeffy.com/hosting-a-free-event-and-creating-free-tickets-to-an-event",
  "https://support.zeffy.com/wordpress-donate-button-plugin",
  "https://support.zeffy.com/data-privacy-how-zeffy-protects-your-account-data",
  "https://support.zeffy.com/how-can-i-add-a-seating-chart-to-my-ticketing-form-1",
  "https://support.zeffy.com/tracking-bids-and-payments-on-your-auction-form",
  "https://support.zeffy.com/i-am-not-a-nonprofit.-can-i-still-use-zeffy",
  "https://support.zeffy.com/how-to-preset-teams-and-participant-pages-in-advance-and-not-have-fundraising-open-to-the-public",
  "https://support.zeffy.com/how-to-customize-your-email-sender-domain-in-zeffy",
  "https://support.zeffy.com/how-can-i-add-an-open-field-to-my-donation-form",
  "https://support.zeffy.com/how-can-i-issue-complimentary-or-free-tickets-in-zeffy",
  "https://support.zeffy.com/what-is-zeffy",
  "https://support.zeffy.com/how-to-hide-the-donor-list-on-your-donation-form",
  "https://support.zeffy.com/how-can-i-change-the-color-of-my-form",
  "https://support.zeffy.com/add-a-donate-button-to-a-website",
  "https://support.zeffy.com/how-is-zeffy-free",
  "https://support.zeffy.com/fiscal-sponsorships-on-zeffy",
  "https://support.zeffy.com/how-do-i-refund-a-donation",
  "https://support.zeffy.com/will-auto-renew-payments-stop-if-i-archive-the-membership-form",
  "https://support.zeffy.com/how-to-create-emails-newsletters-with-zeffys-tools",
  "https://support.zeffy.com/how-can-i-add-pictures-for-my-online-store",
  "https://support.zeffy.com/are-zeffy-tax-receipts-cra-and-irs-compliant",
  "https://support.zeffy.com/filter-contacts-in-zeffy",
  "https://support.zeffy.com/what-is-the-zeffy-referral-program",
  "https://support.zeffy.com/embed-leaderboard-and-thermometer",
  "https://support.zeffy.com/how-can-i-add-a-video-to-my-form",
  "https://support.zeffy.com/how-to-edit-a-form",
  "https://support.zeffy.com/can-i-change-or-customize-the-voluntary-contribution-to-zeffy",
  "https://support.zeffy.com/do-you-have-a-list-of-nonprofits-that-use-zeffy",
  "https://support.zeffy.com/how-to-add-a-waiver-to-your-form",
  "https://support.zeffy.com/how-to-create-an-email-sign-up-form-in-zeffy",
  "https://support.zeffy.com/how-can-i-ask-my-donors-custom-questions",
  "https://support.zeffy.com/configuring-a-50/50-raffle",
  "https://support.zeffy.com/how-to-change-a-supporters-order",
  "https://support.zeffy.com/how-to-sell-digital-products-using-zeffys-thank-you-email-attachments",
  "https://support.zeffy.com/accessing-and-downloading-your-event-guest-list",
  "https://support.zeffy.com/how-to-add-users-to-my-account",
  "https://support.zeffy.com/how-to-allow-people-to-rsvp-on-your-zeffy-form",
  "https://support.zeffy.com/how-do-i-add-my-form-to-my-website",
  "https://support.zeffy.com/how-do-i-set-my-doing-business-as-name",
  "https://support.zeffy.com/checking-in-guests-the-day-of-your-event",
  "https://support.zeffy.com/how-e-tickets-are-generated-on-zeffy",
  "https://support.zeffy.com/can-i-manually-increase-a-thermometer",
];

// Infer category from URL slug
function inferCategory(url: string): string {
  const slug = url.split("/").pop() || "";
  const s = slug.toLowerCase();

  if (s.includes("donation") || s.includes("donate") || s.includes("donor") || s.includes("fund-selection")) return "Donations";
  if (s.includes("ticket") || s.includes("event") || s.includes("guest") || s.includes("check-in") || s.includes("rsvp") || s.includes("seating")) return "Events & Ticketing";
  if (s.includes("raffle") || s.includes("50-50") || s.includes("50/50")) return "Raffles";
  if (s.includes("auction") || s.includes("bid")) return "Auctions";
  if (s.includes("membership") || s.includes("member")) return "Memberships";
  if (s.includes("store") || s.includes("product") || s.includes("shipping") || s.includes("digital-product")) return "Online Store";
  if (s.includes("peer-to-peer") || s.includes("fundraiser") || s.includes("fundraising") || s.includes("thermometer") || s.includes("leaderboard")) return "Peer-to-Peer";
  if (s.includes("tax-receipt") || s.includes("tax-guide") || s.includes("in-kind") || s.includes("advantage-amount") || s.includes("gift-aid") || s.includes("charitable-donation")) return "Tax Receipts";
  if (s.includes("payout") || s.includes("bank") || s.includes("stripe") || s.includes("payment") || s.includes("refund") || s.includes("chargeback") || s.includes("ach") || s.includes("cheque") || s.includes("processing")) return "Payments & Payouts";
  if (s.includes("contact") || s.includes("crm") || s.includes("profile")) return "Contacts & CRM";
  if (s.includes("email") || s.includes("newsletter") || s.includes("unsubscribe") || s.includes("reply-to") || s.includes("notification")) return "Email";
  if (s.includes("import")) return "Data Import";
  if (s.includes("export") || s.includes("report") || s.includes("reconcil")) return "Reports & Export";
  if (s.includes("integrat") || s.includes("zapier") || s.includes("google-analytics") || s.includes("utm") || s.includes("wordpress") || s.includes("api") || s.includes("embed")) return "Integrations";
  if (s.includes("form") || s.includes("custom-question") || s.includes("waiver") || s.includes("translate") || s.includes("color") || s.includes("image") || s.includes("video") || s.includes("url-link") || s.includes("redirect") || s.includes("qr-code")) return "Forms & Customization";
  if (s.includes("getting-started") || s.includes("migrat") || s.includes("onboarding") || s.includes("what-is-zeffy") || s.includes("how-is-zeffy-free") || s.includes("who-can-use") || s.includes("test-the-platform") || s.includes("sample")) return "Getting Started";
  if (s.includes("account") || s.includes("password") || s.includes("verification") || s.includes("two-factor") || s.includes("2fa") || s.includes("ownership") || s.includes("user") || s.includes("organization")) return "Account & Settings";
  if (s.includes("campaign") || s.includes("communication") || s.includes("reminder")) return "Campaigns";
  if (s.includes("volunteer")) return "Volunteering";
  if (s.includes("sponsor")) return "Sponsorships";
  if (s.includes("discount") || s.includes("promo")) return "Discounts";
  if (s.includes("tap-to-pay") || s.includes("in-person")) return "In-Person Payments";
  if (s.includes("contribution") || s.includes("tip")) return "Zeffy Contribution";
  if (s.includes("privacy") || s.includes("terms")) return "Legal & Privacy";

  return "General";
}

// Extract title from HTML
function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (match) {
    let title = match[1].trim();
    // Remove common suffixes
    title = title.replace(/\s*[\|–-]\s*Zeffy.*$/i, "").trim();
    title = title.replace(/\s*[\|–-]\s*Help Center.*$/i, "").trim();
    return title;
  }
  return "";
}

// Extract main content text from HTML (first ~500 chars of article body)
function extractSnippet(html: string): string {
  // Remove scripts and styles
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");

  // Try to find article/main content
  const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    || text.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
    || text.match(/<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  if (articleMatch) {
    text = articleMatch[1];
  }

  // Strip HTML tags, decode entities, normalize whitespace
  text = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  // Return first 800 characters to keep it reasonable for search
  return text.slice(0, 800);
}

async function fetchArticle(url: string): Promise<{ title: string; snippet: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ZeffyKBScraper/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`  SKIP ${url} — ${res.status}`);
      return null;
    }
    const html = await res.text();
    const title = extractTitle(html);
    const snippet = extractSnippet(html);

    if (!title || !snippet || snippet.length < 20) {
      console.warn(`  SKIP ${url} — no content extracted`);
      return null;
    }

    return { title, snippet };
  } catch (err) {
    console.warn(`  SKIP ${url} — ${err}`);
    return null;
  }
}

async function main() {
  console.log(`Scraping ${KB_URLS.length} KB articles...\n`);

  // Deduplicate URLs
  const uniqueUrls = [...new Set(KB_URLS)];
  const articles: { url: string; title: string; category: string; content_snippet: string }[] = [];

  // Process in batches of 10 to avoid overwhelming the server
  const BATCH_SIZE = 10;
  for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
    const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (url) => {
        const data = await fetchArticle(url);
        if (data) {
          return {
            url,
            title: data.title,
            category: inferCategory(url),
            content_snippet: data.snippet,
          };
        }
        return null;
      })
    );

    for (const r of results) {
      if (r) articles.push(r);
    }

    console.log(`  Processed ${Math.min(i + BATCH_SIZE, uniqueUrls.length)}/${uniqueUrls.length}`);
  }

  console.log(`\nScraped ${articles.length} articles successfully.`);

  // Upsert into Supabase (use url as unique key)
  console.log("Upserting into kb_articles table...");

  // Batch upsert in chunks of 50
  for (let i = 0; i < articles.length; i += 50) {
    const chunk = articles.slice(i, i + 50);
    const { error } = await supabase
      .from("kb_articles")
      .upsert(
        chunk.map((a) => ({
          url: a.url,
          title: a.title,
          category: a.category,
          content_snippet: a.content_snippet,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "url" }
      );

    if (error) {
      console.error(`  Error upserting batch ${i}: ${error.message}`);
    } else {
      console.log(`  Upserted ${Math.min(i + 50, articles.length)}/${articles.length}`);
    }
  }

  console.log("\nDone! KB articles populated.");
}

main().catch(console.error);
